import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { AuditService, encodeReason, FeatureFlagsService } from '../admin/index.js';
import { IdempotencyService, parseIdempotencyKey } from '../idempotency/index.js';
import { ADMIN_EDIT_FLAG, adminReasonLabel, AdminStoreEditService, StoreSettingsService, StoresService, validateAdminReason, type AdminReason, type Store } from '../stores/index.js';
import { BulkBatchesService } from './bulk-batches.service.js';
import { CatalogService } from './catalog.service.js';
import { productVariants, products } from './db/schema.js';
import { planItem, type AdminBlockReason, type AdminBulkAction, type ItemPlan } from './domain/admin-bulk.js';
import { available, lowStockTransition } from './domain/stock.js';

/** Teto de itens por ação (WB-353 C6) e de ações EXECUTADAS por admin por hora (C-ADM-07). */
export const ADMIN_BULK_MAX_ITEMS = 200;
export const ADMIN_BULK_PER_HOUR = 10;

export interface AdminBulkInput {
  reason?: { code?: string | undefined; note?: string | undefined } | undefined;
  productIds: string[];
  dryRun: boolean;
  expectedVersions?: { productId: string; version: number }[] | undefined;
  action: AdminBulkAction;
}

export interface AdminBulkResult {
  dryRun: boolean;
  willChange: number;
  changed: number;
  auditEntries: number;
  batchId: string | null;
  merchantNotified: 'aggregate' | 'none';
  preview?: { productId: string; name: string; version: number }[];
  blocked: { productId: string; name: string; reason: AdminBlockReason }[];
}

interface Execution {
  result: AdminBulkResult;
  changedIds: string[];
  notice: { summary: string; reasonLabel: string } | null;
}

const plural = (n: number): string => `${n} ${n === 1 ? 'produto' : 'produtos'}`;
const SUMMARY: Record<AdminBulkAction['type'], (n: number) => string> = {
  pause: (n) => `A Webag pausou ${plural(n)} da sua loja`,
  resume: (n) => `A Webag reativou ${plural(n)} da sua loja`,
  stock_set: (n) => `A Webag definiu o estoque de ${plural(n)} da sua loja`,
  stock_adjust: (n) => `A Webag ajustou o estoque de ${plural(n)} da sua loja`,
};

/**
 * WB-353 C6/C11, C-ADM-07 (ADR-018 D6, D7, D17, D18): o admin pausa, reativa e ajusta o estoque de até 200 produtos da loja, SEMPRE com motivo, versão por item e auditoria
 * por item. Reajuste de PREÇO em massa pelo admin não existe na R1. Roda no módulo do catálogo e reusa o `CatalogService` (versão, vitrine) sem tocar a tabela alheia.
 *
 * Execução = `IdempotencyService.runInTransaction` (D18): a chave, os itens (travados em ORDEM DE ID), a conferência de `expectedVersions`, a auditoria por item, o lote, a linha agregada do painel
 * do lojista e a resposta guardada compartilham UM commit. O limite de 10 por hora conta só a execução que altera algo e só dentro da primeira execução da chave (a repetição não conta).
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly catalog: CatalogService,
    private readonly batches: BulkBatchesService,
    private readonly stores: StoresService,
    private readonly settings: StoreSettingsService,
    private readonly edits: AdminStoreEditService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly limiter: RateLimitService,
  ) {}

  private async reasonOf(raw: AdminBulkInput['reason']): Promise<AdminReason> {
    const flagOn = await this.flags.isEnabled(ADMIN_EDIT_FLAG);
    const checked = validateAdminReason(raw ?? null, { flagOn });
    if (!checked.ok) throw errors.unprocessable(checked.problem.code, checked.problem.code === 'REASON_REQUIRED' ? 'Informe o motivo' : 'Motivo não permitido', { errors: [{ field: checked.problem.field, message: checked.problem.message }] });
    return checked.reason;
  }

  async bulk(admin: Principal, ctx: RequestContext, storeId: string, input: AdminBulkInput, rawKey: string | undefined): Promise<AdminBulkResult> {
    const ids = [...new Set(input.productIds.map((id) => id.toLowerCase()))].sort();
    if (ids.length > ADMIN_BULK_MAX_ITEMS) throw errors.unprocessable('BULK_TOO_LARGE', 'Seleção grande demais', { errors: [{ field: 'productIds', message: `No máximo ${ADMIN_BULK_MAX_ITEMS} produtos por ação.` }] });
    const reason = await this.reasonOf(input.reason);
    const store = await this.stores.getStore(storeId);
    this.catalog.assertWritable(store);
    if (input.dryRun) return this.preview(store, ids, input.action);

    // Escrita: a chave e as versões de TODOS os itens são exigidas aqui (o OpenAPI não expressa "depende de dryRun").
    const key = parseIdempotencyKey(rawKey);
    if (!key) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Chave de idempotência obrigatória', { detail: 'A ação em massa exige o header Idempotency-Key (gerado uma vez por clique em "Aplicar").' });
    const covered = new Set((input.expectedVersions ?? []).map((e) => e.productId.toLowerCase()));
    const missing = ids.filter((id) => !covered.has(id));
    if (missing.length > 0) throw new AppError(400, 'EXPECTED_VERSIONS_REQUIRED', 'Versões dos produtos obrigatórias', { detail: 'Envie `expectedVersions` com a versão de cada produto, como veio na prévia.', errors: missing.map((id) => ({ field: 'expectedVersions', message: id })) });

    const threshold = input.action.type === 'stock_set' || input.action.type === 'stock_adjust' ? await this.settings.lowStockThresholdFor(store.id) : 0; // lido ANTES da transação (DT-094)
    const done: { execution: Execution | null } = { execution: null };
    const stored = await this.idempotency.runInTransaction(`admin-bulk:${store.id}:${admin.userId}`, key, input, async (tx) => {
      const execution = await this.apply(tx, admin, ctx, store, ids, input, reason, threshold);
      done.execution = execution;
      return execution.result;
    });
    // Depois do commit, e só na execução (a repetição da mesma chave devolve a resposta guardada e não avisa de novo).
    if (done.execution && done.execution.changedIds.length > 0) {
      await this.catalog.afterBulk(store, done.execution.changedIds);
      if (done.execution.notice) await this.edits.notifyOwner(store, done.execution.notice.summary, done.execution.notice.reasonLabel);
    }
    return stored;
  }

  /** Prévia: o que mudaria, o que seria bloqueado e a `version` de TODOS os itens (volta em `expectedVersions`). Não trava, não grava, não conta no limite. */
  private async preview(store: Store, ids: string[], action: AdminBulkAction): Promise<AdminBulkResult> {
    const rows = await this.db.select().from(products).where(and(inArray(products.id, ids), eq(products.storeId, store.id))).orderBy(asc(products.id));
    if (rows.length !== ids.length) throw errors.notFound('Produto não encontrado.'); // outra loja ou inexistente: 404 para o pedido todo (SEC-020)
    const variants = await this.variantsByProduct(this.db, ids, action);
    const plans = rows.map((row) => ({ row, plan: planItem(action, row, variants.get(row.id) ?? []) }));
    return {
      dryRun: true,
      willChange: plans.filter((p) => isChange(p.plan)).length,
      changed: 0,
      auditEntries: 0,
      batchId: null,
      merchantNotified: 'none',
      preview: rows.map((row) => ({ productId: row.id, name: row.name, version: row.version })),
      blocked: blockedOf(plans),
    };
  }

  private async variantsByProduct(executor: Db | Tx, ids: string[], action: AdminBulkAction, lock = false) {
    const byProduct = new Map<string, (typeof productVariants.$inferSelect)[]>();
    if (action.type !== 'stock_set' && action.type !== 'stock_adjust') return byProduct;
    const query = executor.select().from(productVariants).where(and(inArray(productVariants.productId, ids), eq(productVariants.active, true))).orderBy(asc(productVariants.id));
    for (const variant of await (lock ? query.for('update') : query)) byProduct.set(variant.productId, [...(byProduct.get(variant.productId) ?? []), variant]);
    return byProduct;
  }

  private async apply(tx: Tx, admin: Principal, ctx: RequestContext, store: Store, ids: string[], input: AdminBulkInput, reason: AdminReason, lowStockThreshold: number): Promise<Execution> {
    const action = input.action;
    const rows = await tx.select().from(products).where(and(inArray(products.id, ids), eq(products.storeId, store.id))).orderBy(asc(products.id)).for('update');
    if (rows.length !== ids.length) throw errors.notFound('Produto não encontrado.');
    // Versão da prévia (D17): qualquer item mudado depois dela cancela o lote inteiro; antes do bloqueio por item, para uma prévia velha não mascarar o conflito.
    const expected = new Map((input.expectedVersions ?? []).map((e) => [e.productId.toLowerCase(), e.version]));
    const conflicts = rows.filter((row) => expected.get(row.id) !== row.version).map((row) => ({ productId: row.id, name: row.name, currentVersion: row.version }));
    if (conflicts.length > 0) {
      throw new AppError(409, 'BULK_VERSION_CONFLICT', 'Produtos alterados depois da prévia', { detail: `${conflicts.length} produto(s) mudaram depois da prévia. Nada foi aplicado; refaça a prévia.`, extensions: { conflicts } });
    }
    const variants = await this.variantsByProduct(tx, ids, action, true);
    const plans = rows.map((row) => ({ row, plan: planItem(action, row, variants.get(row.id) ?? []) }));
    const blocked = blockedOf(plans);
    const changes = plans.filter((p): p is { row: typeof p.row; plan: Exclude<ItemPlan, { kind: 'noop' | 'blocked' }> } => isChange(p.plan));
    if (changes.length === 0) {
      return { result: { dryRun: false, willChange: 0, changed: 0, auditEntries: 0, batchId: null, merchantNotified: 'none', blocked }, changedIds: [], notice: null };
    }

    // C-ADM-07: 10 ações em massa por hora por admin, contadas só quando executa. Conta ANTES de gravar; erro depois devolve a contagem (o rollback não desfaz o Redis).
    const limitKey = `rl:admin-bulk:${admin.userId}`;
    const hit = await this.limiter.hit(limitKey, 3600);
    if (hit.count > ADMIN_BULK_PER_HOUR) {
      await this.limiter.release(limitKey);
      throw errors.tooMany(hit.ttlSeconds, `Limite de ${ADMIN_BULK_PER_HOUR} ações em massa por hora. Tente de novo em instantes.`);
    }
    try {
      return await this.write(tx, ctx, admin, store, action, reason, rows.length, changes, blocked, variants, lowStockThreshold);
    } catch (error) {
      await this.limiter.release(limitKey);
      throw error;
    }
  }

  private async write(
    tx: Tx,
    ctx: RequestContext,
    admin: Principal,
    store: Store,
    action: AdminBulkAction,
    reason: AdminReason,
    requested: number,
    changes: { row: typeof products.$inferSelect; plan: Exclude<ItemPlan, { kind: 'noop' | 'blocked' }> }[],
    blocked: AdminBulkResult['blocked'],
    variants: Map<string, (typeof productVariants.$inferSelect)[]>,
    lowStockThreshold: number,
  ): Promise<Execution> {
    const encoded = encodeReason(reason);
    for (const { row, plan } of changes) {
      if (plan.kind === 'status') {
        const edited = await this.catalog.editProduct(tx, row.id, { status: plan.to });
        await this.audit.record(tx, ctx, { action: action.type === 'pause' ? 'product.pause' : 'product.resume', targetType: 'product', targetId: row.id, storeId: store.id, reason: encoded, before: { status: row.status, version: row.version }, after: { status: edited.status, version: edited.version } });
      } else {
        const variant = (variants.get(row.id) ?? [])[0];
        if (!variant) throw errors.notFound('Variação não encontrada.');
        // Re-arma o aviso de estoque baixo se o estoque novo ficou acima do limite; o aviso em si é o agregado (nunca um e-mail por produto).
        // `lowStockTransition` é a regra única (a mesma do lojista). Aqui só o REARME vale: o admin nunca desarma (o aviso de estoque baixo é do fluxo de venda) nem envia aviso por produto.
        const rearm = !variant.lowStockArmed && lowStockTransition(available(plan.to, variant.reserved), lowStockThreshold, variant.lowStockArmed).armed ? { lowStockArmed: true } : {};
        await tx.update(productVariants).set({ stock: plan.to, updatedAt: new Date(), ...rearm }).where(eq(productVariants.id, variant.id));
        const edited = await this.catalog.editProduct(tx, row.id, {});
        await this.audit.record(tx, ctx, { action: 'product.stock_adjust', targetType: 'variant', targetId: variant.id, storeId: store.id, reason: encoded, before: { productId: row.id, stock: plan.from, reserved: variant.reserved, version: row.version }, after: { productId: row.id, stock: plan.to, reserved: variant.reserved, version: edited.version } });
      }
    }
    const params: Record<string, unknown> = { reasonCode: reason.code, ...('value' in action ? { value: action.value } : {}) };
    const batch = await this.batches.record(tx, { storeId: store.id, kind: action.type, source: 'admin', actorUserId: admin.userId, itemsCount: changes.length, params });
    const summary = SUMMARY[action.type](changes.length);
    const reasonLabel = adminReasonLabel(reason);
    // Uma linha para a loja (histórico do admin, tipo `bulk`) e UMA linha no painel do lojista, com o motivo: nunca N avisos (C11).
    const storeAuditId = await this.audit.record(tx, ctx, { action: 'product.bulk', targetType: 'store', targetId: store.id, storeId: store.id, reason: encoded, before: null, after: { action: action.type, ...('value' in action ? { value: action.value } : {}), requested, changed: changes.length, batchId: batch.id } });
    await this.edits.recordFeed(tx, { storeId: store.id, auditId: storeAuditId, type: 'bulk', target: 'Catálogo', summary, reasonLabel, before: null, after: { action: action.type, ...('value' in action ? { value: action.value } : {}), count: changes.length } });
    return {
      result: { dryRun: false, willChange: changes.length, changed: changes.length, auditEntries: changes.length, batchId: batch.id, merchantNotified: 'aggregate', blocked },
      changedIds: changes.map((c) => c.row.id),
      notice: { summary, reasonLabel },
    };
  }
}

const isChange = (plan: ItemPlan): plan is Exclude<ItemPlan, { kind: 'noop' | 'blocked' }> => plan.kind === 'status' || plan.kind === 'stock';

function blockedOf(plans: { row: { id: string; name: string }; plan: ItemPlan }[]): AdminBulkResult['blocked'] {
  return plans.flatMap(({ row, plan }) => (plan.kind === 'blocked' ? [{ productId: row.id, name: row.name, reason: plan.reason }] : []));
}
