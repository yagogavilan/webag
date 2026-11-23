import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Env } from '../../platform/config/env.js';
import { DRIZZLE, type Db, type DbOrTx, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { ParametersService } from '../admin/index.js';
import { sessions } from '../identity/db/schema.js';
import { addressIdentifier, hmacOf, hmacsOf, normalizeIdentifier, rateKey, type FraudKeys } from './domain/fraud-keys.js';
import { normalizeEmailForFraud } from './domain/email.js';
import { couponFraudClaims, couponFraudSignals, couponIdentifierSightings, couponReservations } from './db/schema.js';

/** Identificador já em HMAC. `claimKind` é o tipo gravado em `coupon_fraud_claims` (o e-mail normalizado também é `account`, com outro HMAC). */
export interface FraudIdentifier {
  claimKind: 'account' | 'device' | 'address' | 'document';
  /** HMAC da chave ATUAL: o que se grava e sobre o que se toma o advisory lock. */
  current: string;
  /** Atual e anterior (rotação): o que se LÊ. */
  all: string[];
}

export interface FraudSubject {
  userId: string;
  email: string;
  deviceIds: string[];
  address?: { cep: string | null | undefined; number: string | null | undefined } | null;
  payerDocument?: string | null | undefined;
}

export type FraudRejection = 'COUPON_FIRST_PURCHASE_ONLY' | 'COUPON_NOT_APPLICABLE';

const KIND_ORDER = ['account', 'device', 'address', 'document'] as const;
const DAY_MS = 86_400_000;

/**
 * WB-344 / ADR-019 D6: antifraude de cupom por HMAC. NUNCA grava nem loga CPF, endereço, id de aparelho, e-mail ou IP em claro (C-CUP-05): toda entrada vira HMAC-SHA256
 * hexadecimal com a chave dedicada, e o banco recusa texto que não seja HMAC (CHECK). O celular não é identificador (DEC-103 D-01).
 */
@Injectable()
export class FraudService {
  private readonly fraudKeys: FraudKeys;

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    config: ConfigService<Env, true>,
    private readonly limits: RateLimitService,
    private readonly params: ParametersService,
  ) {
    this.fraudKeys = { current: config.get('COUPON_FRAUD_HMAC_KEY', { infer: true }), previous: config.get('COUPON_FRAUD_HMAC_KEY_PREVIOUS', { infer: true }) ?? null };
  }

  /** Versão da chave que escreve (1 = a atual; a anterior só lê). */
  readonly keyVersion = 1;

  /** HMAC da conta para os avistamentos (no lugar do `user_id`, que apontaria a pessoa). */
  accountHmac(userId: string): string {
    return hmacOf(this.fraudKeys.current, 'account', userId.toLowerCase());
  }

  /** SEC-225/SEC-226: conta (id e e-mail normalizado), TODOS os aparelhos das sessões, endereço sem complemento e documento informado. Ordem: account, device, address, document. */
  identifiersOf(subject: FraudSubject): FraudIdentifier[] {
    const out: FraudIdentifier[] = [];
    const push = (claimKind: FraudIdentifier['claimKind'], hmacKind: 'account' | 'account_email' | 'device' | 'address' | 'document', value: string | null): void => {
      if (value === null) return;
      const h = hmacsOf(this.fraudKeys, hmacKind, value);
      if (!out.some((o) => o.claimKind === claimKind && o.current === h.current)) out.push({ claimKind, current: h.current, all: h.all });
    };
    push('account', 'account', normalizeIdentifier('account', subject.userId));
    push('account', 'account_email', normalizeEmailForFraud(subject.email));
    for (const device of subject.deviceIds) push('device', 'device', normalizeIdentifier('device', device));
    if (subject.address) push('address', 'address', normalizeIdentifier('address', addressIdentifier(subject.address.cep, subject.address.number) ?? ''));
    if (subject.payerDocument) push('document', 'document', normalizeIdentifier('document', subject.payerDocument));
    return out;
  }

  /** SEC-225: o aparelho NÃO é só o do cabeçalho; vale todo `device_id` das sessões da conta nos últimos 30 dias. */
  async deviceIdsOf(userId: string, headerDeviceId: string | null, db: DbOrTx = this.db): Promise<string[]> {
    const rows = await db
      .selectDistinct({ deviceId: sessions.deviceId })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.lastUsedAt, new Date(Date.now() - 30 * DAY_MS))));
    const ids = new Set(rows.map((r) => r.deviceId).filter((d): d is string => !!d));
    if (headerDeviceId) ids.add(headerDeviceId);
    return [...ids].sort().slice(0, 20);
  }

  /**
   * C-CUP-06: tentativas de aplicar cupom por conta, por IP e por aparelho (contadores em Redis com chave por HMAC; o IP e o aparelho nunca em claro). A tentativa é CONTADA ANTES
   * da busca (código inexistente também conta, senão o limite viraria oráculo de existência). A seguinte, depois do teto, é 429 `COUPON_RATE_LIMITED` com bloqueio até o fim da janela de 1 hora.
   */
  async countAttempt(subject: { userId: string; ip: string | null; deviceId: string | null }): Promise<void> {
    const [accountMax, ipMax, deviceMax] = await Promise.all([this.params.getNumber('cupom_tentativas_conta_hora'), this.params.getNumber('cupom_tentativas_ip_hora'), this.params.getNumber('cupom_tentativas_aparelho_hora')]);
    const checks: [string, number][] = [[rateKey(this.fraudKeys, 'account', subject.userId), accountMax]];
    if (subject.ip) checks.push([rateKey(this.fraudKeys, 'ip', subject.ip), ipMax]);
    if (subject.deviceId) checks.push([rateKey(this.fraudKeys, 'device', subject.deviceId), deviceMax]);
    for (const [key, max] of checks) {
      const hit = await this.limits.hit(key, 3600);
      if (hit.count > max) throw new AppError(429, 'COUPON_RATE_LIMITED', 'Muitas tentativas de cupom', { detail: 'Você tentou muitos cupons. Tente de novo mais tarde.', retryAfterSeconds: hit.ttlSeconds });
    }
  }

  /** Sinal aberto da conta: o próximo pedido sai sem cupom até o admin liberar (RN-C6). */
  async hasOpenSignal(userId: string, db: DbOrTx = this.db): Promise<boolean> {
    const [row] = await db.select({ id: couponFraudSignals.id }).from(couponFraudSignals).where(and(eq(couponFraudSignals.userId, userId), eq(couponFraudSignals.state, 'open'))).limit(1);
    return row !== undefined;
  }

  /** 3 devoluções com cupom (cancelado OU expirado, SEC-228) em 7 dias da conta: o próximo pedido sai sem cupom. */
  async tooManyReturns(userId: string, db: DbOrTx = this.db): Promise<boolean> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(couponReservations)
      .where(and(eq(couponReservations.userId, userId), eq(couponReservations.state, 'returned'), inArray(couponReservations.returnedReason, ['cancelled', 'expired']), gt(couponReservations.returnedAt, new Date(Date.now() - 7 * DAY_MS))));
    return (row?.n ?? 0) >= 3;
  }

  /** Leitura sem efeito (vitrine e aplicar cupom): a primeira compra já foi consumida por algum identificador? */
  async firstPurchaseTaken(ids: FraudIdentifier[], db: DbOrTx = this.db): Promise<FraudRejection | null> {
    for (const id of ids) {
      const [row] = await db
        .select({ id: couponFraudClaims.id })
        .from(couponFraudClaims)
        .where(and(eq(couponFraudClaims.kind, id.claimKind), inArray(couponFraudClaims.hmac, id.all), eq(couponFraudClaims.state, 'active'), eq(couponFraudClaims.scope, 'first_purchase')))
        .limit(1);
      if (row) return id.claimKind === 'account' ? 'COUPON_FIRST_PURCHASE_ONLY' : 'COUPON_NOT_APPLICABLE';
    }
    return null;
  }

  /** Ordem global de travas, passo 3 (B1): advisory lock de cada HMAC da chave ATUAL, em ordem fixa (tipo, valor crescente). Só a primeira compra precisa. */
  async lockFirstPurchase(tx: Tx, ids: FraudIdentifier[]): Promise<void> {
    const ordered = [...ids].sort((a, b) => KIND_ORDER.indexOf(a.claimKind) - KIND_ORDER.indexOf(b.claimKind) || (a.current < b.current ? -1 : a.current > b.current ? 1 : 0));
    for (const id of ordered) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`coupon-fraud:${id.claimKind}:${id.current}`}))`);
  }

  /** Grava a primeira compra consumida por cada identificador. O índice único parcial decide a corrida; o advisory lock só serializa a reconferência. */
  async claimFirstPurchase(tx: Tx, input: { campaignId: string; orderId: string }, ids: FraudIdentifier[]): Promise<FraudRejection | null> {
    const taken = await this.firstPurchaseTaken(ids, tx);
    if (taken) return taken;
    for (const id of ids) {
      const inserted = await tx
        .insert(couponFraudClaims)
        .values({ scope: 'first_purchase', kind: id.claimKind, hmac: id.current, keyVersion: this.keyVersion, orderId: input.orderId, campaignId: input.campaignId })
        .onConflictDoNothing()
        .returning({ id: couponFraudClaims.id });
      if (inserted.length === 0) return id.claimKind === 'account' ? 'COUPON_FIRST_PURCHASE_ONLY' : 'COUPON_NOT_APPLICABLE';
    }
    return null;
  }

  /**
   * Limite de uso por aparelho da CAMPANHA (`campaign_use`), conferido sob a trava da campanha: no máximo `perCustomerLimit` usos vivos (reservados ou confirmados)
   * por aparelho e, SEC-228, no máximo 1 reserva `reserved` por aparelho (o atacante com vários aparelhos segue limitado pelo orçamento; IP não entra, CGNAT).
   */
  async claimCampaignUse(tx: Tx, input: { campaignId: string; orderId: string; perCustomerLimit: number }, ids: FraudIdentifier[]): Promise<FraudRejection | null> {
    for (const id of ids.filter((i) => i.claimKind === 'device')) {
      const rows = await tx
        .select({ state: couponReservations.state })
        .from(couponFraudClaims)
        .innerJoin(couponReservations, eq(couponReservations.orderId, couponFraudClaims.orderId))
        .where(and(eq(couponFraudClaims.campaignId, input.campaignId), eq(couponFraudClaims.kind, 'device'), inArray(couponFraudClaims.hmac, id.all), eq(couponFraudClaims.state, 'active'), eq(couponFraudClaims.scope, 'campaign_use')));
      const live = rows.filter((r) => r.state === 'reserved' || r.state === 'confirmed').length;
      if (live >= input.perCustomerLimit || rows.some((r) => r.state === 'reserved')) return 'COUPON_NOT_APPLICABLE';
    }
    const devices = ids.filter((i) => i.claimKind === 'device');
    if (devices.length > 0) {
      await tx.insert(couponFraudClaims).values(devices.map((id) => ({ scope: 'campaign_use' as const, kind: 'device' as const, hmac: id.current, keyVersion: this.keyVersion, orderId: input.orderId, campaignId: input.campaignId })));
    }
    return null;
  }

  /** Libera as claims do pedido: a primeira compra só se `releaseFirstPurchase` (pedido não pago, ou estornado por inteiro ANTES de entregue, Q17); o uso da campanha sempre. */
  async releaseClaims(tx: Tx, orderId: string, opts: { releaseFirstPurchase: boolean }): Promise<void> {
    const scopes: ('first_purchase' | 'campaign_use')[] = opts.releaseFirstPurchase ? ['first_purchase', 'campaign_use'] : ['campaign_use'];
    await tx
      .update(couponFraudClaims)
      .set({ state: 'released', releasedAt: new Date() })
      .where(and(eq(couponFraudClaims.orderId, orderId), eq(couponFraudClaims.state, 'active'), inArray(couponFraudClaims.scope, scopes)));
  }

  /** Avistamentos (RN-C6 f): contas DISTINTAS (HMAC) por aparelho, endereço ou documento; 3 em 24 h abrem o sinal da conta, sem bloquear este pedido. */
  async recordSightings(tx: Tx, input: { userId: string; orderId: string; campaignId: string }, ids: FraudIdentifier[]): Promise<void> {
    const account = this.accountHmac(input.userId);
    for (const id of ids.filter((i) => i.claimKind !== 'account')) {
      await tx
        .insert(couponIdentifierSightings)
        .values({ kind: id.claimKind as 'device' | 'address' | 'document', hmac: id.current, accountHmac: account, keyVersion: this.keyVersion })
        .onConflictDoUpdate({ target: [couponIdentifierSightings.kind, couponIdentifierSightings.hmac, couponIdentifierSightings.accountHmac], set: { lastSeenAt: new Date() } });
      const [row] = await tx
        .select({ n: sql<number>`count(distinct ${couponIdentifierSightings.accountHmac})::int` })
        .from(couponIdentifierSightings)
        .where(and(eq(couponIdentifierSightings.kind, id.claimKind as 'device' | 'address' | 'document'), inArray(couponIdentifierSightings.hmac, id.all), gt(couponIdentifierSightings.lastSeenAt, new Date(Date.now() - DAY_MS))));
      if ((row?.n ?? 0) >= 3) await this.openSignal(tx, { ...input, signal: id.claimKind === 'device' ? 'device_accounts' : id.claimKind === 'address' ? 'address_accounts' : 'payer_accounts' });
    }
  }

  async openSignal(tx: Tx, input: { userId: string; orderId: string; campaignId: string; signal: 'device_accounts' | 'address_accounts' | 'payer_accounts' | 'cancellations' | 'account_velocity' }): Promise<void> {
    await tx.insert(couponFraudSignals).values(input).onConflictDoNothing();
  }

  /** Depois de devolver uma reserva por cancelamento ou expiração: 3 em 7 dias abrem o sinal `cancellations` (SEC-228). */
  async afterReturn(tx: Tx, input: { userId: string; orderId: string; campaignId: string }): Promise<void> {
    if (await this.tooManyReturns(input.userId, tx)) await this.openSignal(tx, { ...input, signal: 'cancellations' });
  }

  /** Falha de pedido por sinal: mensagem neutra (RN-C11), nunca diz qual identificador casou. */
  neutral(): AppError {
    return errors.unprocessable('COUPON_NOT_APPLICABLE', 'Cupom não aplicável', { detail: 'Não foi possível aplicar este cupom a este pedido.' });
  }
}
