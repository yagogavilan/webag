import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { StorefrontCacheService } from '../../platform/cache/storefront-cache.service.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, type Page } from '../../platform/http/pagination.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { encodeReason, FeatureFlagsService, type StoreHistoryType } from '../admin/index.js';
import { users } from '../identity/db/schema.js';
import { storeActivity, storeAdminChanges, stores } from './db/schema.js';
import { ADMIN_REASON_LABEL, validateAdminReason, type AdminReason } from './domain/admin-reason.js';
import type { PauseKind } from './domain/hours.js';
import { StoreSettingsService, type Actor, type AuditRef } from './store-settings.service.js';
import { deliverySchema, exchangePolicySchema, holidaysSchema, hoursSchema, pickupSchema, profileSchema } from './stores.schemas.js';
import { StoresService, type Store } from './stores.service.js';

/** Flag do J27 (cláusula nos Termos do Lojista): nasce DESLIGADA; desligada, só vale o motivo "solicitado pelo lojista". */
export const ADMIN_EDIT_FLAG = 'admin_edita_catalogo_sem_pedido';
/** Lista FECHADA de campos que o admin edita no cadastro (C-ADM-03): nunca documento, razão social, endereço, conta, equipe nem status. */
export const ADMIN_PROFILE_FIELDS = ['name', 'description', 'phone', 'whatsapp'] as const;
const profileChangesSchema = profileSchema.pick({ name: true, description: true, phone: true, whatsapp: true }).refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo.');
const CONFIG_SECTIONS = { hours: hoursSchema, holidays: holidaysSchema, delivery: deliverySchema, pickup: pickupSchema, 'exchange-policy': exchangePolicySchema } as const;
type Section = keyof typeof CONFIG_SECTIONS;
const SECTION_TYPE: Record<Section, StoreHistoryType> = { hours: 'hours', holidays: 'holidays', delivery: 'delivery', pickup: 'pickup', 'exchange-policy': 'exchange_policy' };
const SECTION_NAME: Record<Section, string> = { hours: 'o horário de funcionamento', holidays: 'os feriados e datas especiais', delivery: 'a configuração de entrega', pickup: 'a configuração de retirada', 'exchange-policy': 'a política de trocas' };

export interface AdminEditResult {
  storeVersion: number;
  auditEntryId: number;
  merchantNotified: 'now' | 'digest' | 'aggregate';
}

interface Applied {
  type: StoreHistoryType;
  /** O que o lojista lê: "A Webag alterou ...". Sem nome de pessoa. */
  summary: string;
  target: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  auditId: number;
}

/**
 * WB-351: o admin edita dados, horário, pausa e status da loja SEMPRE com motivo do catálogo, versão (`UPDATE ... WHERE version = :v`, C6) e auditoria
 * (antes/depois/motivo, com `store_id`). A linha da loja é travada (`FOR UPDATE`) e a versão conferida DENTRO da mesma transação da alteração; o
 * lojista que salvou no meio faz o admin receber 409 `STORE_VERSION_CONFLICT`, nada é sobrescrito. Aviso ao lojista: uma linha no feed do painel
 * (`store_admin_changes`, autor "Webag") e um e-mail na hora. Ordem de locks: loja, depois configuração (a mesma do lojista, sem ciclo).
 */
@Injectable()
export class AdminStoreEditService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly stores: StoresService,
    private readonly settings: StoreSettingsService,
    private readonly flags: FeatureFlagsService,
    private readonly storefront: StorefrontCacheService,
    private readonly mail: MailService,
  ) {}

  // ----------------------------------------------------------------- entrada

  private async reason(raw: unknown): Promise<AdminReason> {
    const flagOn = await this.flags.isEnabled(ADMIN_EDIT_FLAG);
    const checked = validateAdminReason(raw as { code?: unknown; note?: unknown } | null, { flagOn });
    if (!checked.ok) throw errors.unprocessable(checked.problem.code, checked.problem.code === 'REASON_REQUIRED' ? 'Informe o motivo' : 'Motivo não permitido', { errors: [{ field: checked.problem.field, message: checked.problem.message }] });
    return checked.reason;
  }

  private expectedVersion(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) throw errors.validation([{ field: 'expectedVersion', message: 'Informe a versão da loja que você está vendo.' }]);
    return raw;
  }

  private bodyOf(body: unknown, allowed: readonly string[]): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw errors.validation([{ field: 'body', message: 'Corpo inválido.' }]);
    const extra = Object.keys(body).filter((k) => !allowed.includes(k));
    if (extra.length > 0) throw errors.validation(extra.map((field) => ({ field, message: 'Campo não aceito.' })));
    return body as Record<string, unknown>;
  }

  // ----------------------------------------------------------------- operações

  async editProfile(admin: Principal, ctx: RequestContext, storeId: string, body: unknown): Promise<AdminEditResult> {
    const input = this.bodyOf(body, ['reason', 'expectedVersion', 'changes']);
    const expectedVersion = this.expectedVersion(input.expectedVersion);
    const reason = await this.reason(input.reason);
    const changes = input.changes;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw errors.validation([{ field: 'changes', message: 'Informe o que alterar.' }]);
    // C-ADM-03: campo fora da lista fechada (documento, razão social, endereço, conta, equipe, status...) é 422, nunca ignorado em silêncio.
    const forbidden = Object.keys(changes).filter((k) => !(ADMIN_PROFILE_FIELDS as readonly string[]).includes(k));
    if (forbidden.length > 0) throw errors.unprocessable('FIELD_NOT_EDITABLE', 'Campo não editável pelo admin', { errors: forbidden.map((field) => ({ field: `changes.${field}`, message: 'Este campo não pode ser alterado pelo admin.' })) });
    const parsed = profileChangesSchema.safeParse(changes);
    if (!parsed.success) throw errors.validation(parsed.error.issues.map((i) => ({ field: `changes.${i.path.join('.')}`, message: i.message })));
    return this.run(admin, ctx, storeId, expectedVersion, reason, async (tx, store, actor) => {
      const ref = await this.stores.updateProfileAsAdmin(store, parsed.data, actor, ctx, tx);
      return { type: 'profile', summary: 'A Webag alterou os dados da loja', target: 'Dados da loja', before: ref.before, after: ref.after, auditId: ref.id };
    });
  }

  async editConfig(admin: Principal, ctx: RequestContext, storeId: string, section: string, body: unknown): Promise<AdminEditResult> {
    if (!(section in CONFIG_SECTIONS)) throw errors.notFound('Seção desconhecida.');
    const name = section as Section;
    const input = this.bodyOf(body, ['reason', 'expectedVersion', 'data']);
    const expectedVersion = this.expectedVersion(input.expectedVersion);
    const reason = await this.reason(input.reason);
    const schema = CONFIG_SECTIONS[name] as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: { path: PropertyKey[]; message: string }[] } } };
    const parsed = schema.safeParse(input.data);
    if (!parsed.success) throw errors.validation((parsed.error?.issues ?? []).map((i) => ({ field: `data.${i.path.map(String).join('.')}`, message: i.message })));
    const data = parsed.data as never;
    return this.run(admin, ctx, storeId, expectedVersion, reason, async (tx, store, actor) => {
      const set = this.settings;
      let ref: AuditRef;
      if (name === 'hours') ref = await set.setHours(store, (data as { days: never }).days, actor, ctx, tx);
      else if (name === 'holidays') ref = await set.setHolidays(store, (data as { holidays: never }).holidays, actor, ctx, tx);
      else if (name === 'delivery') ref = await set.setDelivery(store, data, actor, ctx, tx);
      else if (name === 'pickup') ref = await set.setPickup(store, data, actor, ctx, tx);
      else ref = await set.setExchangePolicy(store, data, actor, ctx, tx);
      return { type: SECTION_TYPE[name], summary: `A Webag alterou ${SECTION_NAME[name]}`, target: SECTION_NAME[name].replace(/^(o|a|os|as) /, ''), before: ref.before, after: ref.after, auditId: ref.id };
    });
  }

  async pause(admin: Principal, ctx: RequestContext, storeId: string, body: unknown): Promise<AdminEditResult> {
    const input = this.bodyOf(body, ['reason', 'expectedVersion', 'kind']);
    const expectedVersion = this.expectedVersion(input.expectedVersion);
    const reason = await this.reason(input.reason);
    const kind = input.kind;
    if (typeof kind !== 'string' || !['30m', '1h', '2h', 'end_of_day', 'until_resume'].includes(kind)) throw errors.validation([{ field: 'kind', message: 'Escolha a duração da pausa.' }]);
    return this.run(admin, ctx, storeId, expectedVersion, reason, async (tx, store, actor) => {
      const ref = await this.settings.pause(store, kind as PauseKind, actor, ctx, new Date(), tx);
      return { type: 'pause', summary: 'A Webag pausou a sua loja: ela não recebe novos pedidos até reabrir', target: 'Pausa', before: ref.before, after: ref.after, auditId: ref.id };
    });
  }

  async resume(admin: Principal, ctx: RequestContext, storeId: string, body: unknown): Promise<AdminEditResult> {
    const input = this.bodyOf(body, ['reason', 'expectedVersion']);
    const expectedVersion = this.expectedVersion(input.expectedVersion);
    const reason = await this.reason(input.reason);
    return this.run(admin, ctx, storeId, expectedVersion, reason, async (tx, store, actor) => {
      if (!(await this.settings.isPaused(store.id, tx))) throw errors.conflict('STORE_NOT_PAUSED', 'A loja não está pausada', 'Não há pausa ativa para encerrar.');
      const ref = await this.settings.resume(store, actor, ctx, tx);
      return { type: 'pause', summary: 'A Webag reabriu a sua loja', target: 'Pausa', before: ref.before, after: ref.after, auditId: ref.id };
    });
  }

  // ----------------------------------------------------------------- núcleo

  private async run(admin: Principal, ctx: RequestContext, storeId: string, expectedVersion: number, reason: AdminReason, apply: (tx: Tx, store: Store, actor: Actor) => Promise<Applied>): Promise<AdminEditResult> {
    const outcome = await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(stores).where(eq(stores.id, storeId)).for('no key update');
      if (!locked) throw errors.notFound('Loja não encontrada.');
      // C6: a versão é conferida sob o lock da loja, na mesma transação da alteração (equivale a `UPDATE ... WHERE version = :v`).
      if (locked.version !== expectedVersion) {
        throw errors.conflict('STORE_VERSION_CONFLICT', 'A loja foi alterada', 'O lojista alterou a loja agora. Recarregue para ver a versão atual.', { currentVersion: locked.version });
      }
      const actor: Actor = { userId: admin.userId, kind: 'admin', reason: encodeReason(reason) };
      const applied = await apply(tx, locked, actor);
      // BUG-039: antes = depois (ex.: mesmo nome): nada mudou. O 422 desfaz a transação (sem versão +1, sem linha de histórico, sem e-mail "A Webag alterou algo").
      if (applied.before && applied.after && isDeepStrictEqual(applied.before, applied.after)) {
        throw errors.unprocessable('NO_CHANGE', 'Nada mudou', { detail: 'O valor informado é igual ao atual. Nada foi alterado.' });
      }
      const [bumped] = await tx.update(stores).set({ version: sql`${stores.version} + 1`, updatedAt: new Date() }).where(and(eq(stores.id, storeId), eq(stores.version, expectedVersion))).returning({ version: stores.version });
      if (!bumped) throw errors.conflict('STORE_VERSION_CONFLICT', 'A loja foi alterada', 'O lojista alterou a loja agora. Recarregue para ver a versão atual.');
      const reasonLabel = labelOf(reason);
      await tx.insert(storeAdminChanges).values({ storeId, auditId: applied.auditId, type: applied.type, target: applied.target, summary: applied.summary, reasonLabel, before: applied.before, after: applied.after });
      return { version: bumped.version, applied, reasonLabel, store: locked };
    });
    await this.storefront.storeChanged(storeId); // DEC-113: a vitrine em cache reflete em até 5 s
    await this.notifyOwner(outcome.store, outcome.applied.summary, outcome.reasonLabel);
    return { storeVersion: outcome.version, auditEntryId: outcome.applied.auditId, merchantNotified: 'now' };
  }

  /**
   * WB-353 C11: uma linha no feed do painel do lojista (autor sempre "Webag"), gravada NA transação do efeito de quem chama (catálogo em massa do admin).
   * A edição da própria loja (`run`) grava a sua por dentro; esta é a porta para outros módulos, sem tocar na tabela.
   */
  async recordFeed(tx: Tx, input: { storeId: string; auditId: number; type: StoreHistoryType; target: string | null; summary: string; reasonLabel: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }): Promise<void> {
    await tx.insert(storeAdminChanges).values({ storeId: input.storeId, auditId: input.auditId, type: input.type, target: input.target, summary: input.summary, reasonLabel: input.reasonLabel, before: input.before, after: input.after });
  }

  /** E-mail na hora (horário, pausa, status e dados avisam na hora, WB-351 C1; ação em massa: 1 aviso agregado, WB-353 C11). Falha de envio não desfaz a alteração (o feed do painel já tem a linha). */
  async notifyOwner(store: Store, summary: string, reasonLabel: string): Promise<void> {
    try {
      const [owner] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, store.ownerUserId));
      if (!owner) return;
      this.mail.enqueue({
        to: owner.email,
        subject: `A Webag alterou algo na sua loja${store.name ? ` (${store.name})` : ''}`,
        text: `${summary}.\nMotivo: ${reasonLabel}.\n\nVeja o detalhe no painel, em "Alterações da Webag". Se algo estiver errado, fale com o suporte.`,
      });
    } catch {
      /* melhor-esforço: o aviso do painel já foi gravado na transação */
    }
  }

  /**
   * Quem está com a pausa em vigor (ficha 360): o admin, se a última pausa/reabertura registrada é dele; senão o lojista. Compara a última alteração do
   * admin (feed) com a última do lojista (`store_activity`), sem estado extra.
   */
  async pauseAttribution(storeId: string): Promise<{ byAdmin: boolean; reasonLabel: string | null }> {
    const [[admin], [merchant]] = await Promise.all([
      this.db.select({ at: storeAdminChanges.at, summary: storeAdminChanges.summary, reasonLabel: storeAdminChanges.reasonLabel }).from(storeAdminChanges).where(and(eq(storeAdminChanges.storeId, storeId), eq(storeAdminChanges.type, 'pause'))).orderBy(desc(storeAdminChanges.id)).limit(1),
      this.db.select({ at: storeActivity.createdAt }).from(storeActivity).where(and(eq(storeActivity.storeId, storeId), inArray(storeActivity.action, ['store.pause', 'store.resume']))).orderBy(desc(storeActivity.createdAt)).limit(1),
    ]);
    const byAdmin = Boolean(admin && admin.summary.includes('pausou') && (!merchant || admin.at > merchant.at));
    return { byAdmin, reasonLabel: byAdmin ? (admin?.reasonLabel ?? null) : null };
  }

  // ----------------------------------------------------------------- feed do lojista

  /** `listStoreAdminChanges`: uma linha por alteração do admin, autor sempre "Webag", mais recentes primeiro. */
  async listForMerchant(storeId: string, query: { cursor?: string | undefined; limit?: unknown }): Promise<Page<{ id: number; at: string; type: string; summary: string; target: string | null; reasonLabel: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; actor: 'Webag' }>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ id: number }>(query.cursor);
    const rows = await this.db
      .select()
      .from(storeAdminChanges)
      .where(and(eq(storeAdminChanges.storeId, storeId), cursor ? lt(storeAdminChanges.id, Number(cursor.id)) : undefined))
      .orderBy(desc(storeAdminChanges.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      data: page.map((r) => ({ id: r.id, at: r.at.toISOString(), type: r.type, summary: r.summary, target: r.target, reasonLabel: r.reasonLabel, before: r.before, after: r.after, actor: 'Webag' as const })),
      nextCursor: rows.length > limit && last ? encodeCursor({ id: last.id }) : null,
    };
  }
}

/** "Solicitado pelo lojista (WhatsApp, 24/11)": a nota só aparece ao lojista no motivo "solicitado" (canal e data); nos demais ela é interna. */
export function labelOf(reason: AdminReason): string {
  const label = ADMIN_REASON_LABEL[reason.code];
  return reason.code === 'requested_by_merchant' && reason.note ? `${label} (${reason.note})` : label;
}
