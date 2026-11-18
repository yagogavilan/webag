import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, ne, gt } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { paymentAccountChangedEmail, paymentAccountUnderReviewEmail } from '../../platform/mail/templates.js';
import { AuditService } from '../admin/index.js';
import { isUniqueViolation } from '../admin/util.js';
import { adminProfiles, users } from '../identity/db/schema.js';
import { PaymentsService } from '../payments/index.js';
import { paymentAccounts, paymentOauthStates, stores } from './db/schema.js';
import { maskDocument, normalizeDocument } from './domain/document.js';

type Store = typeof stores.$inferSelect;

export const OAUTH_STATE_TTL_MS = 10 * 60_000;
const KEY_VERSION = 'k1';

export interface ConnectedAccount {
  providerAccountId: string;
  holderDocument: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Autorização OAuth do provedor (WB-155). O `fake` simula; o adaptador do Mercado Pago entra com as credenciais do fundador. */
export interface PaymentOAuthProvider {
  readonly name: 'fake' | 'mercadopago';
  /** URL de autorização. `redirect_uri` vem de configuração, nunca da requisição (SEC-045). */
  authorizationUrl(state: string): string;
  exchange(code: string, context: { storeId: string; storeDocument: string }): Promise<ConnectedAccount>;
}
export const PAYMENT_OAUTH_PROVIDER = Symbol('PAYMENT_OAUTH_PROVIDER');

/**
 * Provedor `fake` (WB-053 C5): o `code` escolhe o resultado.
 *   fake-ok                  conecta com titular = documento da loja
 *   fake-ok:<contaId>        idem, com um ID de conta específico (testa "1 conta = 1 loja")
 *   fake-holder:<documento>  titular com documento DIFERENTE do da loja (fica "em análise", SEC-047)
 *   fake-denied              o usuário negou a autorização
 */
@Injectable()
export class FakePaymentOAuthProvider implements PaymentOAuthProvider {
  readonly name = 'fake' as const;
  constructor(private readonly config: ConfigService<Env, true>) {}

  authorizationUrl(state: string): string {
    return `${this.config.get('API_PUBLIC_URL', { infer: true })}/fake-oauth/authorize?state=${encodeURIComponent(state)}`;
  }

  exchange(code: string, context: { storeId: string; storeDocument: string }): Promise<ConnectedAccount> {
    if (code === 'fake-denied') throw new AppError(422, 'OAUTH_DENIED', 'Autorização negada', { detail: 'Você não autorizou a conexão. Tente de novo quando quiser.' });
    const [kind, arg] = code.split(/:(.*)/s);
    if (kind !== 'fake-ok' && kind !== 'fake-holder') throw new AppError(400, 'OAUTH_CODE_INVALID', 'Código de autorização inválido');
    return Promise.resolve({
      providerAccountId: kind === 'fake-ok' && arg ? arg : `fake-seller-${context.storeId}`,
      holderDocument: kind === 'fake-holder' && arg ? normalizeDocument(arg) : context.storeDocument,
      accessToken: `fake-access-${randomToken(12)}`,
      refreshToken: `fake-refresh-${randomToken(12)}`,
      expiresAt: new Date(Date.now() + 180 * 86_400_000),
    });
  }
}

/** Adaptador do Mercado Pago: sem credencial do fundador não conecta (501 explícito, como o provedor de pagamentos). */
@Injectable()
export class MercadoPagoOAuthProvider implements PaymentOAuthProvider {
  readonly name = 'mercadopago' as const;
  authorizationUrl(): string {
    throw new AppError(501, 'NOT_IMPLEMENTED', 'Conexão com o Mercado Pago ainda não implementada', { detail: 'Depende das credenciais do aplicativo (fundador).' });
  }
  exchange(): Promise<ConnectedAccount> {
    return Promise.reject(new AppError(501, 'NOT_IMPLEMENTED', 'Conexão com o Mercado Pago ainda não implementada'));
  }
}

/** Conta de recebimento (WB-053, SEC-045..048). */
@Injectable()
export class PaymentAccountService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(PAYMENT_OAUTH_PROVIDER) private readonly provider: PaymentOAuthProvider,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly payments: PaymentsService,
  ) {}

  private get encKey(): string {
    return this.config.get('PAYMENT_TOKEN_ENC_KEY', { infer: true });
  }

  /** SEC-046: AES-256-GCM, AAD = loja + versão da chave. Trocar o texto entre lojas falha na decifragem. */
  sealTokens(storeId: string, tokens: { accessToken: string; refreshToken: string }): string {
    return encryptSecret(JSON.stringify(tokens), this.encKey, 'payment-oauth', `store:${storeId}:${KEY_VERSION}`);
  }

  openTokens(storeId: string, sealed: string): { accessToken: string; refreshToken: string } {
    return JSON.parse(decryptSecret(sealed, this.encKey, 'payment-oauth', `store:${storeId}:${KEY_VERSION}`)) as { accessToken: string; refreshToken: string };
  }

  /** Só 1 `state` ativo por loja: gerar um novo invalida o anterior (duplo toque, R-37b). */
  async startConnect(store: Store, principal: Principal): Promise<{ authorizationUrl: string; state: string; expiresInSeconds: number }> {
    const state = randomToken(32);
    await this.db.transaction(async (tx) => {
      await tx
        .update(paymentOauthStates)
        .set({ usedAt: new Date() })
        .where(and(eq(paymentOauthStates.storeId, store.id), isNull(paymentOauthStates.usedAt)));
      await tx.insert(paymentOauthStates).values({
        stateHash: sha256Hex(state),
        storeId: store.id,
        userId: principal.userId,
        sessionId: principal.sessionId,
        expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
      });
    });
    return { authorizationUrl: this.provider.authorizationUrl(state), state, expiresInSeconds: OAUTH_STATE_TTL_MS / 1000 };
  }

  /** O `state` precisa ser desta sessão E desta loja, de uso único e dentro de 10 min; senão nada é vinculado (SEC-045). */
  async completeConnect(store: Store, principal: Principal, input: { code: string; state: string }, ctx: RequestContext) {
    const invalid = () => new AppError(400, 'OAUTH_STATE_INVALID', 'Link expirado', { detail: 'Link expirado. Conecte de novo.' });
    const consumed = await this.db
      .update(paymentOauthStates)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(paymentOauthStates.stateHash, sha256Hex(input.state)),
          eq(paymentOauthStates.storeId, store.id),
          eq(paymentOauthStates.userId, principal.userId),
          eq(paymentOauthStates.sessionId, principal.sessionId),
          isNull(paymentOauthStates.usedAt),
          gt(paymentOauthStates.expiresAt, new Date()),
        ),
      )
      .returning({ id: paymentOauthStates.id });
    if (consumed.length === 0) throw invalid();

    const account = await this.provider.exchange(input.code, { storeId: store.id, storeDocument: store.documentNumber });
    const matches = normalizeDocument(account.holderDocument) === store.documentNumber;
    try {
      await this.db.transaction(async (tx) => {
        // Reconectar substitui a conta anterior (a antiga fica `disconnected`).
        await tx.update(paymentAccounts).set({ status: 'disconnected', disconnectedAt: new Date() }).where(and(eq(paymentAccounts.storeId, store.id), ne(paymentAccounts.status, 'disconnected')));
        await tx.insert(paymentAccounts).values({
          storeId: store.id,
          provider: this.provider.name,
          providerAccountId: account.providerAccountId,
          status: matches ? 'active' : 'under_review',
          holderDocumentMasked: maskDocument(account.holderDocument),
          holderMatchesStore: matches,
          tokensEnc: this.sealTokens(store.id, account),
          tokensExpireAt: account.expiresAt,
          connectedBy: principal.userId,
        });
        await this.audit.record(tx, ctx, { action: 'store.payment_account_connect', targetType: 'store', targetId: store.id, after: { provider: this.provider.name, holderMatchesStore: matches } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('PAYMENT_ACCOUNT_IN_USE', 'Essa conta já está em uso por outra loja', 'Essa conta já está em uso por outra loja. Fale com o suporte.');
      throw error;
    }
    if (!matches) await this.alertTeam(store, 'payment_account_holder_mismatch');
    if (!matches) this.mail.enqueue({ to: principal.email, ...paymentAccountUnderReviewEmail() });
    return this.view(store.id);
  }

  /** Dados mascarados, só para o dono (SEC-048). Nunca devolve token nem o ID completo do titular. */
  async view(storeId: string) {
    const [row] = await this.db.select().from(paymentAccounts).where(and(eq(paymentAccounts.storeId, storeId), ne(paymentAccounts.status, 'disconnected')));
    if (!row) return { connected: false as const };
    return {
      connected: true as const,
      provider: row.provider,
      status: row.status,
      holderDocumentMasked: row.holderDocumentMasked,
      holderMatchesStore: row.holderMatchesStore,
      connectedAt: row.connectedAt.toISOString(),
    };
  }

  /** Trocar ou desconectar: senha <= 5 min (feito no controller), e-mail ao dono, auditoria e alerta ao admin (SEC-048). */
  async disconnect(store: Store, principal: Principal, ctx: RequestContext): Promise<void> {
    const changed = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(paymentAccounts)
        .set({ status: 'disconnected', disconnectedAt: new Date() })
        .where(and(eq(paymentAccounts.storeId, store.id), ne(paymentAccounts.status, 'disconnected')))
        .returning({ id: paymentAccounts.id });
      if (rows.length === 0) return false;
      await this.audit.record(tx, ctx, { action: 'store.payment_account_disconnect', targetType: 'store', targetId: store.id });
      return true;
    });
    if (!changed) throw errors.notFound('Nenhuma conta conectada.');
    this.mail.enqueue({ to: principal.email, ...paymentAccountChangedEmail() });
    await this.alertTeam(store, 'payment_account_changed');
  }

  /** WB-103 C7: o admin libera (ou mantém bloqueada) uma conta "em análise" por titular divergente. */
  async release(storeId: string, adminUserId: string, reason: string, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(paymentAccounts).where(and(eq(paymentAccounts.storeId, storeId), eq(paymentAccounts.status, 'under_review'))).for('update');
      if (!row) throw errors.conflict('NO_ACCOUNT_UNDER_REVIEW', 'Não há conta em análise');
      await tx.update(paymentAccounts).set({ status: 'active', releasedBy: adminUserId, releaseReason: reason }).where(eq(paymentAccounts.id, row.id));
      await this.audit.record(tx, ctx, { action: 'store.payment_account_release', targetType: 'store', targetId: storeId, reason, after: { holderDocumentMasked: row.holderDocumentMasked } });
    });
  }

  /** SEC-047/048: alerta para financeiro/super admin (painel de alertas) e e-mail aos super admins, em até 1 min. */
  private async alertTeam(store: Store, kind: string): Promise<void> {
    await this.payments.raiseAlert(null, kind, { storeId: store.id }).catch(() => undefined);
    const rows = await this.db
      .select({ email: users.email })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId))
      .where(and(eq(adminProfiles.profile, 'super_admin'), eq(adminProfiles.active, true)));
    for (const row of rows) this.mail.enqueue({ to: row.email, ...paymentAccountChangedEmail(store.name ?? store.id, true) });
  }
}
