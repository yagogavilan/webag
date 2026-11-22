import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { StorefrontCacheService } from '../../platform/cache/storefront-cache.service.js';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type DbOrTx, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors, type FieldError } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { lowStockEmail } from '../../platform/mail/templates.js';
import { categories } from '../admin/db/schema.js';
import { isUniqueViolation } from '../admin/util.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { StoresService, StoreSettingsService, type Store } from '../stores/index.js';
import { moderationTerms, productCreationMetrics, productImages, productModerationEvents, products, productVariants, storeSections, type ModerationStatus, type ProductStatus, type ProductVia } from './db/schema.js';
import { IMPORT_TEMPLATE, planImport, type ImportedProduct } from './domain/import.js';
import { matchesSuspectWord, normalizeWord } from './domain/moderation.js';
import { effectivePrice, endOfMinute, MAX_PRICE_CENTS, MIN_PRICE_CENTS, validatePromotion, type Promotion } from './domain/price.js';
import { adjustPriceCents, changePct, percentToBp, type PriceAdjust } from './domain/bulk.js';
import { draftExpiresAt } from './domain/draft.js';
import { pctToBp, youReceiveCents } from './domain/receive.js';
import { applyAdjust, available, isLow, isOfferable, lowStockTransition, MAX_STOCK, type StockAdjust } from './domain/stock.js';
import { attributesKey, validateVariantSet, type Attributes } from './domain/variants.js';

export type Product = typeof products.$inferSelect;
export type Variant = typeof productVariants.$inferSelect;
type ImportPlan = Exclude<ReturnType<typeof planImport>, { fileError: string }>;

/** Planilha já lida e validada (sem transação aberta): `commitImport` só grava. */
export interface PreparedImport {
  plan: ImportPlan;
  draftLimit: number;
}

/** Pedidos em andamento de um produto (WB-060 C5). A Onda 4 troca esta implementação pela consulta real. */
export abstract class ProductOrdersPort {
  abstract hasOpenOrders(productId: string): Promise<boolean>;
}

/** Quem escreve no catálogo: o `ctx` (IP, aparelho, requisição) vai para o `audit_log` junto com o antes/depois (I4). */
export interface CatalogActor {
  userId: string;
  ctx: RequestContext;
}

/** Ação do `audit_log` por escrita do lojista (I4, ADR-018 D20 b); `store-history.ts` as classifica por prefixo (`product.price*`, `product.stock*`, `product.bulk*`). */
export const CATALOG_AUDIT = {
  update: 'product.update',
  price: 'product.price',
  variants: 'product.variants_set',
  stock: 'product.stock_adjust',
  images: 'product.images_set',
  publish: 'product.publish',
  quickPublish: 'product.quick_publish',
  bulk: 'product.bulk',
  duplicate: 'product.duplicate',
} as const;

const MAX_SECTIONS = 30;
const MAX_BULK = 200;

export interface BulkPreviewItem {
  productId: string;
  name: string;
  version: number;
  fromCents: number;
  toCents: number;
  changePct: number;
  youReceiveCents: number | null;
  exceedsLimit: boolean;
}

export interface BulkResult {
  dryRun: boolean;
  willChange: number;
  changed: number;
  blocked: { productId: string; name: string; reason: string }[];
  preview?: BulkPreviewItem[];
  requiresConfirmation?: boolean;
  /** Só na prévia (`dryRun`) de `price_adjust`: o `reajuste_max_pct` que a tela usa para marcar o item e pedir a confirmação (DEC-126). */
  limitPct?: number;
  batchId?: string | null;
  undoUntil?: string | null;
}

const priceError = (field: string): AppError =>
  errors.unprocessable('PRICE_OUT_OF_RANGE', 'Preço fora da faixa', { errors: [{ field, message: 'O preço vai de R$ 0,01 a R$ 99.999,99.' }] });

/** Catálogo da loja (WB-060 a WB-066). Toda consulta é escopada pela loja da rota: produto de outra loja é 404 (SEC-020). */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
    private readonly media: MediaService,
    private readonly stores: StoresService,
    private readonly storeSettings: StoreSettingsService,
    private readonly mail: MailService,
    private readonly orders: ProductOrdersPort,
    private readonly storefront: StorefrontCacheService,
    private readonly audit: AuditService,
  ) {}

  // ----------------------------------------------------------------- helpers

  /** Só loja aprovada mexe no catálogo (suspensa/recusada/em análise não). */
  assertWritable(store: Store): void {
    if (store.status !== 'approved') {
      throw errors.conflict('STORE_NOT_APPROVED', 'Loja ainda não aprovada', 'O catálogo é liberado depois da aprovação da loja.');
    }
  }

  async requireProduct(storeId: string, productId: string, executor: DbOrTx = this.db, lock = false): Promise<Product> {
    const query = executor.select().from(products).where(and(eq(products.id, productId), eq(products.storeId, storeId)));
    const [product] = await (lock ? query.for('update') : query);
    if (!product) throw errors.notFound('Produto não encontrado.');
    return product;
  }

  async variantsOf(productId: string, executor: DbOrTx = this.db, activeOnly = true): Promise<Variant[]> {
    return executor
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), activeOnly ? eq(productVariants.active, true) : undefined))
      .orderBy(asc(productVariants.createdAt), asc(productVariants.id));
  }

  /** Categoria ativa e fora da lista de proibidas (WB-060 C6). A subcategoria herda a proibição do pai. */
  async assertCategoryAllowed(categoryId: string, field = 'categoryId', executor: DbOrTx = this.db): Promise<void> {
    const [category] = await executor.select().from(categories).where(eq(categories.id, categoryId));
    if (!category?.active) {
      throw errors.unprocessable('CATEGORY_INACTIVE', 'Categoria indisponível', { errors: [{ field, message: 'Escolha uma categoria ativa.' }] });
    }
    if (await this.isCategoryForbidden(category.id, category.parentId, executor)) {
      throw errors.unprocessable('CATEGORY_FORBIDDEN', 'Tipo de produto não permitido', {
        detail: 'Esse tipo de produto não é permitido no Webag',
        errors: [{ field, message: 'Esse tipo de produto não é permitido no Webag' }],
      });
    }
  }

  async isCategoryForbidden(categoryId: string, parentId: string | null, executor: DbOrTx = this.db): Promise<boolean> {
    const ids = [categoryId, ...(parentId ? [parentId] : [])];
    const rows = await executor.select({ id: moderationTerms.id }).from(moderationTerms).where(and(eq(moderationTerms.kind, 'forbidden_category'), inArray(moderationTerms.value, ids)));
    return rows.length > 0;
  }

  private async assertSection(storeId: string, sectionId: string | null | undefined): Promise<void> {
    if (!sectionId) return;
    const [section] = await this.db.select({ id: storeSections.id }).from(storeSections).where(and(eq(storeSections.id, sectionId), eq(storeSections.storeId, storeId)));
    if (!section) throw errors.unprocessable('SECTION_NOT_FOUND', 'Seção não encontrada', { errors: [{ field: 'sectionId', message: 'Escolha uma seção da sua loja.' }] });
  }

  checkPrice(value: number | null | undefined, field: string): void {
    if (value === null || value === undefined) return;
    if (!Number.isInteger(value) || value < MIN_PRICE_CENTS || value > MAX_PRICE_CENTS) throw priceError(field);
  }

  private promoOf(product: Pick<Product, 'promoPriceCents' | 'promoStartsAt' | 'promoEndsAt'>): Promotion {
    return { promoPriceCents: product.promoPriceCents, promoStartsAt: product.promoStartsAt, promoEndsAt: product.promoEndsAt };
  }

  /** Palavras suspeitas SINALIZAM (nunca bloqueiam): produto novo/editado que casar entra em "Revisar" (WB-107 C3). */
  async flagIfSuspect(executor: DbOrTx, product: Product, texts: string[]): Promise<boolean> {
    if (product.moderationStatus !== 'ok') return false;
    const words = (await executor.select({ value: moderationTerms.value }).from(moderationTerms).where(eq(moderationTerms.kind, 'suspect_word'))).map((row) => row.value);
    const hits = matchesSuspectWord(texts.join(' '), words);
    if (hits.length === 0) return false;
    await executor.update(products).set({ moderationStatus: 'review' satisfies ModerationStatus, moderationReason: `Palavra suspeita: ${hits.join(', ')}`, moderatedAt: new Date() }).where(eq(products.id, product.id));
    await this.moderationEvent(executor, product, 'flag', `Palavra suspeita: ${hits.join(', ')}`, null);
    return true;
  }

  private async moderationEvent(executor: DbOrTx, product: Pick<Product, 'id' | 'storeId'>, action: 'flag' | 'pause' | 'remove' | 'restore', reason: string | null, actorId: string | null): Promise<void> {
    await executor.insert(productModerationEvents).values({ productId: product.id, storeId: product.storeId, action, reason, actorId });
  }

  // ---------------------------------------------------- versão, auditoria, regras

  /**
   * ADR-018 D2 (I2): o ÚNICO ponto que grava em `products` por EDIÇÃO de catálogo e sobe `version`. Reserva, venda e devolução de estoque gravam só
   * `product_variants`; a moderação e o vencimento do rascunho têm caminho próprio. Sem gatilho de banco: um gatilho em todo `UPDATE` subiria a versão por reserva e venda.
   */
  async editProduct(tx: DbOrTx, productId: string, patch: Partial<typeof products.$inferInsert>): Promise<Product> {
    const [row] = await tx
      .update(products)
      .set({ ...patch, version: sql`${products.version} + 1`, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning();
    if (!row) throw errors.notFound('Produto não encontrado.');
    return row;
  }

  /** `If-Match` presente e diferente da versão atual: 409 com a versão atual (nada foi gravado). Ausente: grava sem conferir (app 1.0), mas a versão sobe. */
  assertVersion(product: Pick<Product, 'version' | 'updatedAt' | 'basePriceCents'>, ifMatch: number | null): void {
    if (ifMatch === null || ifMatch === product.version) return;
    throw errors.conflict('PRODUCT_VERSION_CONFLICT', 'Produto alterado', 'Este produto foi alterado por outra pessoa ou em outro aparelho. Veja a versão atual antes de salvar.', {
      current: { version: product.version, updatedAt: product.updatedAt.toISOString(), basePriceCents: product.basePriceCents },
    });
  }

  private snapshot(product: Product) {
    return {
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      sectionId: product.sectionId,
      status: product.status,
      basePriceCents: product.basePriceCents,
      promoPriceCents: product.promoPriceCents,
      promoStartsAt: product.promoStartsAt?.toISOString() ?? null,
      promoEndsAt: product.promoEndsAt?.toISOString() ?? null,
      sizeChart: product.sizeChart,
      noVoluntaryExchange: product.noVoluntaryExchange,
      variantAttributes: product.variantAttributes,
      version: product.version,
    };
  }

  /** I4: antes/depois do lojista no `audit_log`, com `store_id`, NA MESMA transação do efeito. Só edição humana grava; reserva e venda de estoque, nunca. */
  async auditProduct(tx: DbOrTx, actor: CatalogActor, storeId: string, action: string, productId: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, targetType: 'product' | 'store' = 'product'): Promise<void> {
    await this.audit.record(tx, actor.ctx, { action, targetType, targetId: targetType === 'store' ? storeId : productId, storeId, before, after });
  }

  /** Regra da categoria (RN-Q1, DEC-106): a categoria ou a mãe exige descrição; vale o maior mínimo. Nulo = descrição opcional. */
  async descriptionRule(categoryId: string | null, executor: DbOrTx = this.db): Promise<{ minChars: number } | null> {
    if (!categoryId) return null;
    const [category] = await executor.select().from(categories).where(eq(categories.id, categoryId));
    if (!category) return null;
    const [parent] = category.parentId ? await executor.select().from(categories).where(eq(categories.id, category.parentId)) : [];
    const rules = [category, parent].filter((c) => c?.descriptionRequired).map((c) => c!.descriptionMinChars);
    return rules.length > 0 ? { minChars: Math.max(...rules) } : null;
  }

  /** 422 `DESCRIPTION_REQUIRED` ao publicar (e ao editar produto ativo) em categoria que exige descrição, nas duas vias. */
  async assertDescription(categoryId: string | null, description: string | null, executor: DbOrTx = this.db): Promise<void> {
    const rule = await this.descriptionRule(categoryId, executor);
    if (rule && (description ?? '').trim().length < rule.minChars) {
      throw errors.unprocessable('DESCRIPTION_REQUIRED', 'Descrição obrigatória', {
        detail: `Nesta categoria a descrição é obrigatória (mínimo de ${rule.minChars} caracteres).`,
        errors: [{ field: 'description', message: `Descreva o produto com ao menos ${rule.minChars} caracteres.` }],
      });
    }
  }

  /** Parâmetro `rascunhos_max_por_loja`, lido ANTES da transação (uma consulta fora da transação, sem segurar uma 2ª conexão do pool dentro dela). */
  draftLimit(): Promise<number> {
    return this.params.getNumber('rascunhos_max_por_loja');
  }

  /** Teto de rascunhos da loja (DEC-118, I3): chamar DENTRO da transação que insere, depois de `lockForCatalogWrite`. 422 `DRAFT_LIMIT_REACHED` com as vagas que restam. */
  async assertDraftCapacity(tx: Tx, storeId: string, adding: number, limit: number): Promise<number> {
    await this.stores.lockForCatalogWrite(tx, storeId);
    const [row] = await tx.select({ total: sql<number>`count(*)::int` }).from(products).where(and(eq(products.storeId, storeId), eq(products.status, 'draft')));
    const draftCount = row?.total ?? 0;
    if (draftCount + adding > limit) {
      const slotsAvailable = Math.max(0, limit - draftCount);
      throw errors.unprocessable('DRAFT_LIMIT_REACHED', 'Limite de rascunhos', {
        detail: `Limite de ${limit} rascunhos. ${slotsAvailable === 0 ? 'Publique ou apague algum para criar outro.' : `Cabem mais ${slotsAvailable}.`}`,
        extensions: { limit, draftCount, slotsAvailable },
      });
    }
    return draftCount;
  }

  /** WB-379: abre a medição do cadastro (1 linha por produto) no mesmo instante do rascunho. Sem texto do produto. */
  async startMetrics(tx: DbOrTx, storeId: string, productIds: string[], via: ProductVia): Promise<void> {
    if (productIds.length === 0) return;
    await tx.insert(productCreationMetrics).values(productIds.map((productId) => ({ storeId, productId, via }))).onConflictDoNothing();
  }

  /** `photo_captured`: a 1ª foto anexada ao produto (só grava a primeira vez). */
  async markFirstPhoto(tx: DbOrTx, productId: string): Promise<void> {
    await tx.update(productCreationMetrics).set({ firstPhotoAt: new Date() }).where(and(eq(productCreationMetrics.productId, productId), sql`${productCreationMetrics.firstPhotoAt} is null`));
  }

  /** `product_create_published`: grava a publicação e devolve o evento (sem texto do produto) para o log estruturado DEPOIS do commit. */
  async markPublished(tx: DbOrTx, productId: string, photos: number, variations: number): Promise<{ via: string; durationS: number } | null> {
    const [row] = await tx
      .update(productCreationMetrics)
      .set({ publishedAt: new Date(), photosCount: photos, variationsCount: variations })
      .where(and(eq(productCreationMetrics.productId, productId), sql`${productCreationMetrics.publishedAt} is null`))
      .returning();
    return row?.publishedAt ? { via: row.via, durationS: Math.max(0, Math.round((row.publishedAt.getTime() - row.startedAt.getTime()) / 1000)) } : null;
  }

  logPublished(storeId: string, event: { via: string; durationS: number } | null, photos: number, variations: number): void {
    if (event) this.logger.log({ event: 'product_create_published', storeId, via: event.via, duration_s: event.durationS, photos_count: photos, variations_count: variations });
  }

  // ------------------------------------------------------------ apresentação

  private presentVariant(variant: Variant, product: Product, threshold: number, now: Date) {
    const free = available(variant.stock, variant.reserved);
    const price = product.basePriceCents === null ? null : effectivePrice(product.basePriceCents, variant.priceCents, this.promoOf(product), now);
    return {
      id: variant.id,
      attributes: variant.attributes,
      sku: variant.sku,
      priceCents: variant.priceCents,
      effectivePriceCents: price?.priceCents ?? null,
      originalPriceCents: price?.originalCents ?? null,
      discountPercent: price?.discountPct ?? null,
      stock: variant.stock,
      reserved: variant.reserved,
      available: free,
      soldOut: free <= 0,
      low: free > 0 && isLow(free, threshold),
    };
  }

  async coverUrls(productIds: string[]): Promise<Map<string, Record<string, string> | null>> {
    const result = new Map<string, Record<string, string> | null>();
    if (productIds.length === 0) return result;
    const rows = await this.db
      .select({ productId: productImages.productId, asset: mediaAssets })
      .from(productImages)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.assetId))
      .where(and(inArray(productImages.productId, productIds), eq(productImages.position, 0)));
    for (const row of rows) result.set(row.productId, this.media.publicVariants(row.asset));
    return result;
  }

  /**
   * Parâmetros que `present` lê. Quem apresenta DENTRO de uma transação (resposta guardada da idempotência) calcula antes e passa, para não segurar uma 2ª
   * conexão do pool com a 1ª presa na transação (com o pool cheio, N requisições se esperariam umas às outras).
   */
  async presentContext(store: Store): Promise<{ threshold: number; validityDays: number }> {
    const [threshold, validityDays] = await Promise.all([this.storeSettings.lowStockThresholdFor(store.id), this.params.getNumber('rascunho_validade_dias')]);
    return { threshold, validityDays };
  }

  async present(store: Store, product: Product, executor: DbOrTx = this.db, context?: { threshold: number; validityDays: number }) {
    const now = new Date();
    const [variants, images, threshold, validityDays] = await Promise.all([
      this.variantsOf(product.id, executor),
      executor
        .select({ id: productImages.id, assetId: productImages.assetId, position: productImages.position, asset: mediaAssets })
        .from(productImages)
        .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.assetId))
        .where(eq(productImages.productId, product.id))
        .orderBy(asc(productImages.position)),
      context ? Promise.resolve(context.threshold) : this.storeSettings.lowStockThresholdFor(store.id),
      context ? Promise.resolve(context.validityDays) : product.status === 'draft' ? this.params.getNumber('rascunho_validade_dias') : Promise.resolve(0),
    ]);
    const views = variants.map((variant) => this.presentVariant(variant, product, threshold, now));
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      sizeChart: product.sizeChart,
      noVoluntaryExchange: product.noVoluntaryExchange,
      categoryId: product.categoryId,
      sectionId: product.sectionId,
      status: product.status,
      moderationStatus: product.moderationStatus,
      // O motivo é do lojista saber (contestar por e-mail); o texto interno de "Revisar" não.
      moderationReason: product.moderationStatus === 'paused' || product.moderationStatus === 'removed' ? product.moderationReason : null,
      basePriceCents: product.basePriceCents,
      promotion: {
        priceCents: product.promoPriceCents,
        startsAt: product.promoStartsAt?.toISOString() ?? null,
        endsAt: product.promoEndsAt?.toISOString() ?? null,
        active: product.basePriceCents !== null && effectivePrice(product.basePriceCents, null, this.promoOf(product), now).originalCents !== null,
      },
      variantAttributes: product.variantAttributes,
      variants: views,
      images: images.map((image) => ({ id: image.assetId, position: image.position, urls: this.media.publicVariants(image.asset) })),
      soldOut: !isOfferable(views.map((variant) => variant.available)),
      publishedAt: product.publishedAt?.toISOString() ?? null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      version: product.version,
      // Produto anterior à v1.1 não tem `via`: o campo some (o contrato só aceita um dos 5 valores, não nulo).
      ...(product.via ? { via: product.via } : {}),
      draftExpiresAt: product.status === 'draft' ? draftExpiresAt(product.updatedAt, validityDays).toISOString() : null,
    };
  }

  // ------------------------------------------------------------------ leitura

  async list(store: Store, filters: { status?: ProductStatus; q?: string; sectionId?: string; lowStock?: boolean; cursor?: string; limit?: unknown }): Promise<Page<unknown>> {
    const limit = parseLimit(filters.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(filters.cursor);
    const threshold = await this.storeSettings.lowStockThresholdFor(store.id);
    const escaped = filters.q?.replace(/[\\%_]/g, (c) => `\\${c}`);
    const rows = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.storeId, store.id),
          filters.status ? eq(products.status, filters.status) : sql`${products.status} <> 'archived'`,
          filters.sectionId ? eq(products.sectionId, filters.sectionId) : undefined,
          escaped ? ilike(products.name, `%${escaped}%`) : undefined,
          filters.lowStock
            ? sql`exists (select 1 from product_variants v where v.product_id = ${products.id} and v.active and v.stock - v.reserved <= ${threshold})`
            : undefined,
          timestampCursorBefore(products.createdAt, products.id, cursor),
        ),
      )
      .orderBy(...timestampOrderDesc(products.createdAt, products.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const ids = page.map((p) => p.id);
    const [variants, covers] = await Promise.all([
      ids.length > 0 ? this.db.select().from(productVariants).where(and(inArray(productVariants.productId, ids), eq(productVariants.active, true))) : Promise.resolve([]),
      this.coverUrls(ids),
    ]);
    const now = new Date();
    const data = page.map((product) => {
      const own = variants.filter((v) => v.productId === product.id).map((v) => this.presentVariant(v, product, threshold, now));
      const prices = own.map((v) => v.effectivePriceCents).filter((p): p is number => p !== null);
      return {
        id: product.id,
        name: product.name,
        status: product.status,
        moderationStatus: product.moderationStatus,
        sectionId: product.sectionId,
        basePriceCents: product.basePriceCents,
        fromPriceCents: prices.length > 0 ? Math.min(...prices) : product.basePriceCents,
        cover: covers.get(product.id) ?? null,
        availableTotal: own.reduce((sum, v) => sum + Math.max(0, v.available), 0),
        low: own.some((v) => v.low),
        soldOut: !isOfferable(own.map((v) => v.available)),
        variantCount: own.length,
        updatedAt: product.updatedAt.toISOString(),
      };
    });
    const last = page.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  async get(store: Store, productId: string) {
    return this.present(store, await this.requireProduct(store.id, productId));
  }

  // ------------------------------------------------------------------ escrita

  async create(store: Store, actor: CatalogActor, input: { name: string; description?: string | null; categoryId?: string | null; sectionId?: string | null; basePriceCents?: number | null }, idempotencyKey: string | null) {
    this.assertWritable(store);
    this.checkPrice(input.basePriceCents, 'basePriceCents');
    if (input.categoryId) await this.assertCategoryAllowed(input.categoryId);
    await this.assertSection(store.id, input.sectionId);
    if (idempotencyKey) {
      const [existing] = await this.db.select().from(products).where(and(eq(products.storeId, store.id), eq(products.idempotencyKey, idempotencyKey)));
      if (existing) return this.present(store, existing);
    }
    const draftLimit = await this.draftLimit();
    try {
      const created = await this.db.transaction(async (tx) => {
        await this.assertDraftCapacity(tx, store.id, 1, draftLimit); // DEC-118: o teto vale também aqui (createProduct nasce como rascunho)
        const [row] = await tx
          .insert(products)
          .values({ storeId: store.id, name: input.name, description: input.description ?? null, categoryId: input.categoryId ?? null, sectionId: input.sectionId ?? null, basePriceCents: input.basePriceCents ?? null, idempotencyKey, via: 'form' })
          .returning();
        if (!row) throw new Error('Falha ao criar produto');
        await this.startMetrics(tx, store.id, [row.id], 'form');
        await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_create', { productId: row.id });
        return row;
      });
      return this.present(store, created);
    } catch (error) {
      if (idempotencyKey && isUniqueViolation(error)) {
        const [existing] = await this.db.select().from(products).where(and(eq(products.storeId, store.id), eq(products.idempotencyKey, idempotencyKey)));
        if (existing) return this.present(store, existing);
      }
      throw error;
    }
  }

  async update(
    store: Store,
    actor: CatalogActor,
    productId: string,
    input: {
      name?: string;
      description?: string | null;
      categoryId?: string | null;
      sectionId?: string | null;
      basePriceCents?: number | null;
      promoPriceCents?: number | null;
      promoStartsAt?: string | null;
      promoEndsAt?: string | null;
      sizeChart?: string | null;
      noVoluntaryExchange?: boolean;
    },
    ifMatch: number | null = null,
  ) {
    this.assertWritable(store);
    this.checkPrice(input.basePriceCents, 'basePriceCents');
    this.checkPrice(input.promoPriceCents, 'promoPriceCents');
    if (input.categoryId) await this.assertCategoryAllowed(input.categoryId);
    if (input.sectionId !== undefined) await this.assertSection(store.id, input.sectionId);

    const updated = await this.db.transaction(async (tx) => {
      const current = await this.requireProduct(store.id, productId, tx, true);
      this.assertVersion(current, ifMatch);
      const base = input.basePriceCents !== undefined ? input.basePriceCents : current.basePriceCents;
      const promo: Promotion = {
        promoPriceCents: input.promoPriceCents !== undefined ? input.promoPriceCents : current.promoPriceCents,
        promoStartsAt: input.promoStartsAt !== undefined ? (input.promoStartsAt ? new Date(input.promoStartsAt) : null) : current.promoStartsAt,
        promoEndsAt: input.promoEndsAt !== undefined ? (input.promoEndsAt ? endOfMinute(new Date(input.promoEndsAt)) : null) : current.promoEndsAt,
      };
      if (current.status === 'active' && base === null) throw errors.unprocessable('PRICE_REQUIRED', 'Preço obrigatório', { errors: [{ field: 'basePriceCents', message: 'Produto ativo precisa de preço.' }] });
      if (current.status === 'active' && input.categoryId === null) throw errors.unprocessable('PRODUCT_INCOMPLETE', 'Produto incompleto', { errors: [{ field: 'categoryId', message: 'Produto ativo precisa de categoria.' }] });
      const hasPromo = promo.promoPriceCents !== null || promo.promoStartsAt !== null || promo.promoEndsAt !== null;
      if (hasPromo) {
        const problem = base === null ? 'Informe o preço normal antes da promoção.' : validatePromotion(base, promo);
        if (problem) throw errors.unprocessable('PROMOTION_INVALID', 'Promoção inválida', { detail: problem, errors: [{ field: 'promoPriceCents', message: problem }] });
      }
      // DEC-106: a regra da categoria vale também ao EDITAR um produto ativo (só quando a edição mexe em descrição ou categoria, para não travar quem só ajusta o preço).
      if (current.status === 'active' && (input.description !== undefined || input.categoryId !== undefined)) {
        await this.assertDescription(input.categoryId !== undefined ? input.categoryId : current.categoryId, input.description !== undefined ? input.description : current.description, tx);
      }
      const row = await this.editProduct(tx, productId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
        ...(input.basePriceCents !== undefined ? { basePriceCents: input.basePriceCents } : {}),
        ...(input.sizeChart !== undefined ? { sizeChart: input.sizeChart || null } : {}),
        ...(input.noVoluntaryExchange !== undefined ? { noVoluntaryExchange: input.noVoluntaryExchange } : {}),
        ...promo,
      });
      if (row.status === 'active' && (input.name !== undefined || input.description !== undefined)) await this.flagIfSuspect(tx, row, [row.name, row.description ?? '']);
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_update', { productId, fields: Object.keys(input) });
      const touchesPrice = input.basePriceCents !== undefined || input.promoPriceCents !== undefined || input.promoStartsAt !== undefined || input.promoEndsAt !== undefined;
      await this.auditProduct(tx, actor, store.id, touchesPrice ? CATALOG_AUDIT.price : CATALOG_AUDIT.update, productId, this.snapshot(current), this.snapshot(row));
      return row;
    });
    await this.storefront.productsChanged(store.id, [updated.id]); // DEC-113: preço, promoção, nome e foto aparecem na página e na vitrine em até 5 s
    return this.present(store, (await this.requireProduct(store.id, updated.id)) );
  }

  // ---------------------------------------------------------------- variações

  /**
   * Substitui o conjunto de variações (WB-061). Variação existente vai por `id`; a que sumiu da lista é desativada (409 se
   * há reserva). Estoque novo/ajustado respeita `disponível >= 0` (RN-06). Tudo sob `FOR UPDATE` do produto e das variações.
   */
  async setVariants(
    store: Store,
    actor: CatalogActor,
    productId: string,
    input: { attributes: string[]; variants: { id?: string; attributes: Attributes; stock?: number; priceCents?: number | null; sku?: string | null }[] },
    ifMatch: number | null = null,
  ) {
    this.assertWritable(store);
    const maxCombinations = await this.params.getNumber('variacoes_max');
    const issues: FieldError[] = validateVariantSet(
      input.attributes,
      input.variants.map((v) => ({ attributes: v.attributes, stock: v.stock ?? 0, priceCents: v.priceCents, sku: v.sku })),
      maxCombinations,
    );
    input.variants.forEach((variant, index) => {
      if (variant.stock !== undefined && (!Number.isInteger(variant.stock) || variant.stock < 0 || variant.stock > MAX_STOCK)) issues.push({ field: `variants[${index}].stock`, message: 'Estoque: inteiro de 0 a 99.999.' });
      if (variant.priceCents !== undefined && variant.priceCents !== null && (variant.priceCents < MIN_PRICE_CENTS || variant.priceCents > MAX_PRICE_CENTS)) issues.push({ field: `variants[${index}].priceCents`, message: 'O preço vai de R$ 0,01 a R$ 99.999,99.' });
    });
    if (issues.length > 0) throw errors.unprocessable('VARIANTS_INVALID', 'Variações inválidas', { errors: issues });

    const low: { variant: Variant; available: number }[] = [];
    try {
      await this.db.transaction(async (tx) => {
        const product = await this.requireProduct(store.id, productId, tx, true);
        this.assertVersion(product, ifMatch);
        const current = await tx.select().from(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.active, true))).orderBy(asc(productVariants.id)).for('update');
        const byId = new Map(current.map((v) => [v.id, v]));
        const keep = new Set<string>();
        for (const [index, wanted] of input.variants.entries()) {
          if (!wanted.id) continue;
          if (!byId.has(wanted.id)) throw errors.unprocessable('VARIANT_NOT_FOUND', 'Variação não encontrada', { errors: [{ field: `variants[${index}].id`, message: 'Variação não pertence a este produto.' }] });
          keep.add(wanted.id);
        }
        for (const old of current) {
          if (!keep.has(old.id)) {
            if (old.reserved > 0) throw reservedError(old.reserved);
            await tx.update(productVariants).set({ active: false, updatedAt: new Date() }).where(eq(productVariants.id, old.id));
          }
        }
        // 1) libera combinações/SKUs das variações editadas antes de gravar as novas (índices únicos parciais).
        for (const wanted of input.variants) {
          if (!wanted.id) continue;
          const old = byId.get(wanted.id)!;
          const key = attributesKey(wanted.attributes);
          if (key !== old.attributesKey && old.reserved > 0) throw reservedError(old.reserved);
          let stock = old.stock;
          if (wanted.stock !== undefined) {
            const next = applyAdjust(old.stock, old.reserved, { set: wanted.stock });
            if ('error' in next) throw next.error === 'below_reserved' ? reservedError(old.reserved) : stockRange();
            stock = next.stock;
          }
          await tx
            .update(productVariants)
            .set({ attributes: wanted.attributes, attributesKey: key, priceCents: wanted.priceCents ?? null, sku: wanted.sku ?? null, stock, updatedAt: new Date() })
            .where(eq(productVariants.id, wanted.id));
          this.collectLow(low, old, stock);
        }
        for (const wanted of input.variants) {
          if (wanted.id) continue;
          await tx.insert(productVariants).values({
            productId,
            storeId: store.id,
            attributes: wanted.attributes,
            attributesKey: attributesKey(wanted.attributes),
            sku: wanted.sku ?? null,
            priceCents: wanted.priceCents ?? null,
            stock: wanted.stock ?? 0,
          });
        }
        const edited = await this.editProduct(tx, product.id, { variantAttributes: input.attributes });
        await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.variants_set', { productId, count: input.variants.length });
        const after = await this.variantsOf(productId, tx);
        await this.auditProduct(tx, actor, store.id, CATALOG_AUDIT.variants, productId, { variantAttributes: product.variantAttributes, variants: variantsAudit(current), version: product.version }, { variantAttributes: edited.variantAttributes, variants: variantsAudit(after), version: edited.version });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const detail = ((error as { cause?: { constraint?: string }; constraint?: string }).cause?.constraint ?? (error as { constraint?: string }).constraint) ?? '';
        if (detail.includes('sku')) throw errors.unprocessable('SKU_IN_USE', 'Código já usado', { errors: [{ field: 'variants', message: 'Esse código (SKU) já existe em outro produto da loja.' }] });
        throw errors.unprocessable('VARIANTS_INVALID', 'Variações inválidas', { errors: [{ field: 'variants', message: 'Essa combinação já existe' }] });
      }
      throw error;
    }
    await this.storefront.productsChanged(store.id, [productId]);
    await this.sendLowStock(store, low);
    return this.present(store, await this.requireProduct(store.id, productId));
  }

  /** Estoque que passa a `disponível <= limite` com o gatilho armado dispara o aviso 1x por variação (R-14). */
  private collectLow(acc: { variant: Variant; available: number }[], variant: Variant, newStock: number): void {
    acc.push({ variant: { ...variant, stock: newStock }, available: available(newStock, variant.reserved) });
  }

  private async sendLowStock(store: Store, changed: { variant: Variant; available: number }[]): Promise<void> {
    if (changed.length === 0) return;
    const threshold = await this.storeSettings.lowStockThresholdFor(store.id);
    for (const { variant, available: free } of changed) {
      const transition = lowStockTransition(free, threshold, variant.lowStockArmed);
      if (transition.armed !== variant.lowStockArmed) await this.db.update(productVariants).set({ lowStockArmed: transition.armed }).where(eq(productVariants.id, variant.id));
      if (transition.notify) {
        const [product] = await this.db.select({ name: products.name }).from(products).where(eq(products.id, variant.productId));
        const owner = await this.stores.ownerEmail(store);
        if (owner.email) this.mail.enqueue({ to: owner.email, ...lowStockEmail(product?.name ?? 'Produto', Object.values(variant.attributes).join(' / '), free) });
      }
    }
  }

  /**
   * Ajuste rápido (+/-/definir). `FOR UPDATE` na variação: dois "+1" simultâneos dão +2, nunca +1 silencioso (O2-EST-03). Só grava pela transação recebida
   * (SEC-218: a escrita relativa roda dentro de `IdempotencyService.runInTransaction`); o que sai depois do commit fica em `afterStockAdjust`.
   */
  async adjustStockIn(tx: Tx, store: Store, actor: CatalogActor, productId: string, variantId: string, adjust: StockAdjust, ifMatch: number | null, context: { threshold: number; validityDays: number }) {
    const product = await this.requireProduct(store.id, productId, tx, true);
    this.assertVersion(product, ifMatch);
    const [variant] = await tx
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), eq(productVariants.active, true)))
      .for('update');
    if (!variant) throw errors.notFound('Variação não encontrada.');
    const next = applyAdjust(variant.stock, variant.reserved, adjust);
    if ('error' in next) throw next.error === 'below_reserved' ? reservedError(variant.reserved) : stockRange();
    await tx.update(productVariants).set({ stock: next.stock, updatedAt: new Date() }).where(eq(productVariants.id, variantId));
    const edited = await this.editProduct(tx, productId, {}); // ajuste MANUAL é edição de catálogo: a versão sobe (a venda e a reserva não passam por aqui)
    await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.stock_adjust', { productId, variantId, from: variant.stock, to: next.stock });
    await this.auditProduct(tx, actor, store.id, CATALOG_AUDIT.stock, variantId, { productId, stock: variant.stock, reserved: variant.reserved, version: product.version }, { productId, stock: next.stock, reserved: variant.reserved, version: edited.version }, 'product');
    const view = (await this.present(store, edited, tx, context)).variants.find((v) => v.id === variantId);
    return { view, changed: { variant, available: available(next.stock, variant.reserved) } };
  }

  /** Depois do commit do ajuste: vitrine (esgotar/repor; a venda não invalida, DEC-113) e alerta de estoque baixo. */
  async afterStockAdjust(store: Store, productId: string, changed: { variant: Variant; available: number }): Promise<void> {
    await this.storefront.productsChanged(store.id, [productId]);
    await this.sendLowStock(store, [changed]);
  }

  /** Sem `Idempotency-Key` (app 1.0): uma transação própria. Com a chave, o controller usa `adjustStockIn` dentro de `runInTransaction`. */
  async adjustStock(store: Store, actor: CatalogActor, productId: string, variantId: string, adjust: StockAdjust, ifMatch: number | null = null) {
    this.assertWritable(store);
    const context = await this.presentContext(store);
    const result = await this.db.transaction((tx) => this.adjustStockIn(tx, store, actor, productId, variantId, adjust, ifMatch, context));
    await this.afterStockAdjust(store, productId, result.changed);
    return result.view;
  }

  // ------------------------------------------------------------------- imagens

  async setImages(store: Store, actor: CatalogActor, productId: string, imageIds: string[], ifMatch: number | null = null) {
    this.assertWritable(store);
    if (new Set(imageIds).size !== imageIds.length) throw errors.validation([{ field: 'imageIds', message: 'Foto repetida.' }]);
    const maxImages = await this.params.getNumber('foto_max_produto'); // BUG-017: parâmetro do admin (RN-02)
    if (imageIds.length > maxImages) throw errors.unprocessable('TOO_MANY_IMAGES', 'Fotos demais', { errors: [{ field: 'imageIds', message: `No máximo ${maxImages} fotos por produto.` }] });
    for (const id of imageIds) await this.media.requireReady(id, { storeId: store.id, purposes: ['product_image'] });
    await this.db.transaction(async (tx) => {
      const product = await this.requireProduct(store.id, productId, tx, true);
      this.assertVersion(product, ifMatch);
      if (product.status === 'active' && imageIds.length === 0) throw errors.unprocessable('IMAGE_REQUIRED', 'Foto obrigatória', { errors: [{ field: 'imageIds', message: 'Produto ativo precisa de ao menos 1 foto.' }] });
      const previous = await tx.select({ assetId: productImages.assetId }).from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.position));
      await tx.delete(productImages).where(eq(productImages.productId, productId));
      if (imageIds.length > 0) await tx.insert(productImages).values(imageIds.map((assetId, position) => ({ productId, assetId, position })));
      const edited = await this.editProduct(tx, productId, {});
      if (imageIds.length > 0) await this.markFirstPhoto(tx, productId);
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.images_set', { productId, count: imageIds.length });
      await this.auditProduct(tx, actor, store.id, CATALOG_AUDIT.images, productId, { imageIds: previous.map((p) => p.assetId), version: product.version }, { imageIds, version: edited.version });
    });
    await this.storefront.productsChanged(store.id, [productId]);
    return this.present(store, await this.requireProduct(store.id, productId));
  }

  // ------------------------------------------------- publicar, pausar, arquivar

  /** Publica (WB-060 C1/C3/C4): lista TODOS os campos que faltam, por campo, num único 422. */
  async publish(store: Store, actor: CatalogActor, productId: string, ifMatch: number | null = null) {
    this.assertWritable(store);
    const { product: published, metrics } = await this.db.transaction(async (tx) => {
      const product = await this.requireProduct(store.id, productId, tx, true);
      this.assertVersion(product, ifMatch);
      if (product.moderationStatus === 'paused' || product.moderationStatus === 'removed') throw moderatedError(product.moderationStatus);
      if (product.status === 'active') return { product, metrics: null };
      if (product.status === 'archived') throw errors.conflict('PRODUCT_ARCHIVED', 'Produto arquivado', 'Produto arquivado não volta à vitrine.');
      const issues: FieldError[] = [];
      if (!product.name || product.name.trim().length < 2) issues.push({ field: 'name', message: 'Informe o nome.' });
      if (!product.categoryId) issues.push({ field: 'categoryId', message: 'Escolha a categoria.' });
      if (product.basePriceCents === null) issues.push({ field: 'basePriceCents', message: 'Informe o preço.' });
      const [images] = await tx.select({ total: sql<number>`count(*)::int` }).from(productImages).where(eq(productImages.productId, productId));
      if ((images?.total ?? 0) < 1) issues.push({ field: 'imageIds', message: 'Envie ao menos 1 foto.' });
      if ((await this.variantsOf(productId, tx)).length < 1) issues.push({ field: 'variants', message: 'Cadastre ao menos 1 variação (ou "sem variação" com estoque).' });
      const rule = await this.descriptionRule(product.categoryId, tx);
      if (rule && (product.description ?? '').trim().length < rule.minChars) issues.push({ field: 'description', message: `Descreva o produto com ao menos ${rule.minChars} caracteres.` });
      if (issues.length > 0) {
        // DEC-106: a falta de descrição em categoria que a exige tem código próprio; as demais faltas seguem em `PRODUCT_INCOMPLETE`.
        if (issues.length === 1 && issues[0]!.field === 'description') throw errors.unprocessable('DESCRIPTION_REQUIRED', 'Descrição obrigatória', { detail: `Nesta categoria a descrição é obrigatória (mínimo de ${rule!.minChars} caracteres).`, errors: issues });
        throw errors.unprocessable('PRODUCT_INCOMPLETE', 'Produto incompleto', { errors: issues });
      }
      if (product.categoryId) await this.assertCategoryAllowed(product.categoryId, 'categoryId', tx);
      const row = await this.editProduct(tx, productId, { status: 'active', publishedAt: product.publishedAt ?? new Date() });
      await this.flagIfSuspect(tx, row, [product.name, product.description ?? '']);
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_publish', { productId });
      await this.auditProduct(tx, actor, store.id, CATALOG_AUDIT.publish, productId, this.snapshot(product), this.snapshot(row));
      const variations = (await this.variantsOf(productId, tx)).length;
      return { product: row, metrics: { event: await this.markPublished(tx, productId, images?.total ?? 0, variations), photos: images?.total ?? 0, variations } };
    });
    if (metrics) this.logPublished(store.id, metrics.event, metrics.photos, metrics.variations);
    await this.storefront.productsChanged(store.id, [productId]);
    return this.present(store, await this.requireProduct(store.id, published.id));
  }

  async pause(store: Store, actor: CatalogActor, productId: string) {
    this.assertWritable(store);
    await this.transition(store, actor, productId, 'active', 'paused', 'catalog.product_pause');
    return this.present(store, await this.requireProduct(store.id, productId));
  }

  /** O lojista NÃO reativa o que a moderação pausou ou removeu: o status de moderação é separado (R-12d, WB-060 C7). */
  async resume(store: Store, actor: CatalogActor, productId: string) {
    this.assertWritable(store);
    await this.transition(store, actor, productId, 'paused', 'active', 'catalog.product_resume');
    return this.present(store, await this.requireProduct(store.id, productId));
  }

  private async transition(store: Store, actor: CatalogActor, productId: string, from: ProductStatus, to: ProductStatus, action: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const product = await this.requireProduct(store.id, productId, tx, true);
      if (to === 'active' && (product.moderationStatus === 'paused' || product.moderationStatus === 'removed')) throw moderatedError(product.moderationStatus);
      if (product.status !== from) throw errors.conflict('INVALID_PRODUCT_STATE', 'Ação indisponível para este produto', `O produto está ${product.status}.`);
      await this.editProduct(tx, productId, { status: to });
      await this.stores.logActivity(tx, store.id, actor.userId, action, { productId });
    });
    await this.storefront.productsChanged(store.id, [productId]);
  }

  /** "Excluir" = arquivar: some da vitrine e do painel, o histórico de pedidos mantém nome e preço (WB-060 C5). */
  async archive(store: Store, actor: CatalogActor, productId: string): Promise<void> {
    this.assertWritable(store);
    await this.db.transaction(async (tx) => {
      const product = await this.requireProduct(store.id, productId, tx, true);
      if (product.status === 'archived') return;
      if (product.status === 'draft') {
        // BUG-036: rascunho nunca foi vendido, então não há histórico a preservar: apaga a linha (variações, fotos e medição caem em cascata), como o vencimento
        // dos 30 dias. Arquivar exigiria nome de 2 a 80 caracteres (CHECK products_name_len) e o rascunho da câmera nasce sem nome.
        await tx.delete(products).where(eq(products.id, productId));
        await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.draft_delete', { productId });
        return;
      }
      if (await this.orders.hasOpenOrders(productId)) throw errors.conflict('OPEN_ORDERS', 'Há pedidos em andamento', 'Há pedidos em andamento com este produto. Pause o produto e tente depois.');
      await this.editProduct(tx, productId, { status: 'archived', archivedAt: new Date() });
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_archive', { productId });
    });
    await this.storefront.productsChanged(store.id, [productId]);
  }

  // ------------------------------------------------------------------- seções

  async sections(store: Store) {
    const rows = await this.db.select().from(storeSections).where(eq(storeSections.storeId, store.id)).orderBy(asc(storeSections.position), asc(storeSections.id));
    const counts = await this.db
      .select({ sectionId: products.sectionId, total: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.storeId, store.id), sql`${products.status} <> 'archived'`))
      .groupBy(products.sectionId);
    return rows.map((row) => ({ id: row.id, name: row.name, position: row.position, productCount: counts.find((c) => c.sectionId === row.id)?.total ?? 0 }));
  }

  async createSection(store: Store, name: string) {
    this.assertWritable(store);
    const existing = await this.db.select({ id: storeSections.id }).from(storeSections).where(eq(storeSections.storeId, store.id));
    if (existing.length >= MAX_SECTIONS) throw errors.unprocessable('TOO_MANY_SECTIONS', 'Seções demais', { detail: `No máximo ${MAX_SECTIONS} seções.` });
    const [row] = await this.db.insert(storeSections).values({ storeId: store.id, name, position: existing.length }).returning();
    return { id: row!.id, name: row!.name, position: row!.position, productCount: 0 };
  }

  private async requireSection(storeId: string, sectionId: string) {
    const [section] = await this.db.select().from(storeSections).where(and(eq(storeSections.id, sectionId), eq(storeSections.storeId, storeId)));
    if (!section) throw errors.notFound('Seção não encontrada.');
    return section;
  }

  async renameSection(store: Store, sectionId: string, name: string) {
    this.assertWritable(store);
    await this.requireSection(store.id, sectionId);
    await this.db.update(storeSections).set({ name }).where(eq(storeSections.id, sectionId));
    return (await this.sections(store)).find((s) => s.id === sectionId);
  }

  /** Excluir seção manda os produtos para "Outros" (`section_id` vira nulo, WB-063 C4). */
  async deleteSection(store: Store, sectionId: string): Promise<void> {
    this.assertWritable(store);
    await this.requireSection(store.id, sectionId);
    await this.db.delete(storeSections).where(eq(storeSections.id, sectionId));
  }

  async orderSections(store: Store, ids: string[]): Promise<void> {
    this.assertWritable(store);
    await this.db.transaction(async (tx) => {
      const rows = await tx.select({ id: storeSections.id }).from(storeSections).where(eq(storeSections.storeId, store.id));
      if (rows.length !== ids.length || rows.some((row) => !ids.includes(row.id))) throw errors.validation([{ field: 'ids', message: 'Envie todas as seções da loja, sem repetir.' }]);
      for (const [position, id] of ids.entries()) await tx.update(storeSections).set({ position }).where(eq(storeSections.id, id));
    });
  }

  // ------------------------------------------------------------- ação em massa

  /** "Você recebe cerca de" por produto (DEC-035): comissão efetiva da loja (ou da categoria quando a loja não tem taxa própria) e a pior tarifa estimada do provedor. */
  async receiveEstimator(storeId: string): Promise<(priceCents: number, categoryId: string | null) => number> {
    const [commission, fee] = await Promise.all([this.stores.commissionView(storeId), this.stores.providerFeeView()]);
    const feeBp = pctToBp(Math.max(fee.pixPct, fee.cardPct));
    return (priceCents, categoryId) => {
      const pct = commission.source === 'store' ? commission.pct : (commission.categories.find((c) => c.categoryId === categoryId)?.pct ?? commission.pct);
      return youReceiveCents(priceCents, pctToBp(pct), feeBp);
    };
  }

  /**
   * WB-066 / WB-377: pausar, reativar, mover de seção ou ajustar preço (+/-% ou +/- R$). Ajuste que levaria algum preço fora de R$ 0,01 a R$ 99.999,99
   * bloqueia a ação INTEIRA e lista os afetados. `dryRun` só mostra o que mudaria (e a `version` de cada item, que volta em `expectedVersions`).
   *
   * SEC-208 / D17 / D18: com `tx` (a transação de `IdempotencyService.runInTransaction`) o efeito, a versão, o antes/depois e a resposta guardada compartilham
   * o commit. Os itens são travados e atualizados em ORDEM DE ID (duas ações em massa simultâneas travam na mesma ordem: sem deadlock). Versão diferente da prévia em
   * qualquer item: 409 `BULK_VERSION_CONFLICT` e NADA é aplicado. Quem chama, depois do commit, invalida a vitrine (`afterBulk`).
   */
  async bulk(
    store: Store,
    actor: CatalogActor,
    input: {
      productIds: string[];
      dryRun: boolean;
      confirmLargeChange?: boolean;
      expectedVersions?: { productId: string; version: number }[];
      action: { type: 'pause' } | { type: 'resume' } | { type: 'move_section'; sectionId: string | null } | { type: 'price_adjust'; mode: 'percent' | 'amount'; value: number };
    },
    outer?: Tx,
  ): Promise<BulkResult> {
    this.assertWritable(store);
    const ids = [...new Set(input.productIds.map((id) => id.toLowerCase()))].sort();
    if (ids.length > MAX_BULK) throw errors.validation([{ field: 'productIds', message: `No máximo ${MAX_BULK} produtos por vez.` }]);
    const action = input.action;
    let adjust: PriceAdjust | null = null;
    if (action.type === 'price_adjust') {
      if (action.mode === 'amount') {
        if (!Number.isInteger(action.value)) throw errors.validation([{ field: 'action.value', message: 'Em reais, informe centavos inteiros.' }]);
        adjust = { mode: 'amount', cents: action.value };
      } else {
        const bp = percentToBp(action.value);
        if (bp === null) throw errors.validation([{ field: 'action.value', message: 'O percentual vai de -90 a +500, com no máximo 2 casas.' }]);
        adjust = { mode: 'percent', bp };
      }
    }
    if (action.type === 'move_section') await this.assertSection(store.id, action.sectionId);
    const expected = new Map((input.expectedVersions ?? []).map((e) => [e.productId.toLowerCase(), e.version]));
    const limitPct = action.type === 'price_adjust' ? await this.params.getNumber('reajuste_max_pct') : 0;
    const estimate = action.type === 'price_adjust' ? await this.receiveEstimator(store.id) : null;

    const run = async (tx: Tx): Promise<BulkResult> => {
      const rows = await tx.select().from(products).where(and(inArray(products.id, ids), eq(products.storeId, store.id))).orderBy(asc(products.id)).for('update');
      // Produto de outra loja (ou inexistente) é 404 para o pedido inteiro: não revela quais ids existem (SEC-020).
      if (rows.length !== ids.length) throw errors.notFound('Produto não encontrado.');
      const blocked: { productId: string; name: string; reason: string }[] = [];
      const changes: { product: Product; patch: Partial<typeof products.$inferInsert>; variantPrices?: { id: string; priceCents: number }[] }[] = [];
      const preview: BulkPreviewItem[] = [];
      for (const product of rows) {
        if (action.type === 'pause') {
          if (product.status === 'active') changes.push({ product, patch: { status: 'paused' } });
        } else if (action.type === 'resume') {
          if (product.moderationStatus === 'paused' || product.moderationStatus === 'removed') blocked.push({ productId: product.id, name: product.name, reason: 'Produto pausado ou removido pela moderação.' });
          else if (product.status === 'paused') changes.push({ product, patch: { status: 'active' } });
        } else if (action.type === 'move_section') {
          if (product.sectionId !== action.sectionId) changes.push({ product, patch: { sectionId: action.sectionId } });
        } else if (adjust) {
          if (product.basePriceCents === null) {
            blocked.push({ productId: product.id, name: product.name, reason: 'Produto sem preço.' });
            continue;
          }
          const next = adjustPriceCents(product.basePriceCents, adjust);
          if (next < MIN_PRICE_CENTS || next > MAX_PRICE_CENTS) {
            blocked.push({ productId: product.id, name: product.name, reason: next < MIN_PRICE_CENTS ? 'O preço ficaria menor que R$ 0,01.' : 'O preço ficaria acima de R$ 99.999,99.' });
            continue;
          }
          if (product.promoPriceCents !== null && next <= product.promoPriceCents) {
            blocked.push({ productId: product.id, name: product.name, reason: 'O novo preço ficaria menor ou igual ao preço promocional.' });
            continue;
          }
          const variants = (await this.variantsOf(product.id, tx)).sort((a, b) => (a.id < b.id ? -1 : 1));
          const variantPrices: { id: string; priceCents: number }[] = [];
          for (const variant of variants) {
            if (variant.priceCents === null) continue;
            const adjusted = adjustPriceCents(variant.priceCents, adjust);
            if (adjusted < MIN_PRICE_CENTS || adjusted > MAX_PRICE_CENTS) {
              blocked.push({ productId: product.id, name: product.name, reason: `O preço da variação ${Object.values(variant.attributes).join(' / ')} sairia da faixa.` });
              variantPrices.length = 0;
              break;
            }
            variantPrices.push({ id: variant.id, priceCents: adjusted });
          }
          if (!blocked.some((b) => b.productId === product.id)) {
            // BUG-039: arredondou para o mesmo valor (ex.: +10% sobre R$ 0,01) e nenhuma variação mudou: não é alteração (sem versão +1 nem linha "de X para X").
            const unchanged = next === product.basePriceCents && variantPrices.every((v) => variants.find((x) => x.id === v.id)?.priceCents === v.priceCents);
            if (!unchanged) changes.push({ product, patch: { basePriceCents: next }, variantPrices });
            const pct = changePct(product.basePriceCents, next);
            preview.push({ productId: product.id, name: product.name, version: product.version, fromCents: product.basePriceCents, toCents: next, changePct: pct, youReceiveCents: estimate ? estimate(next, product.categoryId) : null, exceedsLimit: Math.abs(pct) > limitPct });
          }
        }
      }
      const requiresConfirmation = preview.some((item) => item.exceedsLimit);
      const priceResult = action.type === 'price_adjust' ? { preview, requiresConfirmation, batchId: null, undoUntil: null } : {};
      if (input.dryRun) return { dryRun: true, willChange: changes.length, changed: 0, blocked, ...priceResult, ...(action.type === 'price_adjust' ? { limitPct } : {}) };

      // Versão da prévia (D17): qualquer item mudado depois dela cancela o lote inteiro. Antes de `blocked`: uma prévia velha não pode mascarar o conflito.
      if (expected.size > 0) {
        const conflicts = rows.filter((row) => expected.has(row.id) && expected.get(row.id) !== row.version).map((row) => ({ productId: row.id, name: row.name, currentVersion: row.version }));
        if (conflicts.length > 0) {
          throw new AppError(409, 'BULK_VERSION_CONFLICT', 'Produtos alterados depois da prévia', {
            detail: `${conflicts.length} produto(s) mudaram depois da prévia. Nada foi aplicado; refaça a prévia.`,
            extensions: { conflicts },
          });
        }
      }
      if (blocked.length > 0) {
        throw new AppError(422, 'BULK_BLOCKED', 'Ação bloqueada', { detail: `${blocked.length} produto(s) impedem a ação. Nada foi alterado.`, errors: blocked.map((b) => ({ field: b.productId, message: `${b.name}: ${b.reason}` })) });
      }
      if (requiresConfirmation && !input.confirmLargeChange) {
        const over = preview.filter((item) => item.exceedsLimit);
        throw errors.unprocessable('BULK_NEEDS_CONFIRMATION', 'Confirme o reajuste', {
          detail: `${over.length} produto(s) variam mais de ${limitPct}%. Confira os valores novos e confirme.`,
          errors: over.map((item) => ({ field: item.productId, message: `${item.name}: de ${item.fromCents} para ${item.toCents} centavos (${item.changePct}%).` })),
        });
      }
      for (const change of changes) {
        // `WHERE version = :v` além do lock: 0 linhas = alguém passou na frente (não deveria, com `FOR UPDATE`; é a segunda barreira da D18).
        const wanted = expected.get(change.product.id);
        const [updated] = await tx
          .update(products)
          .set({ ...change.patch, version: sql`${products.version} + 1`, updatedAt: new Date() })
          .where(and(eq(products.id, change.product.id), eq(products.version, wanted ?? change.product.version)))
          .returning();
        if (!updated) throw new AppError(409, 'BULK_VERSION_CONFLICT', 'Produtos alterados depois da prévia', { extensions: { conflicts: [{ productId: change.product.id, name: change.product.name, currentVersion: change.product.version }] } });
        for (const variant of change.variantPrices ?? []) await tx.update(productVariants).set({ priceCents: variant.priceCents, updatedAt: new Date() }).where(eq(productVariants.id, variant.id));
        if (action.type === 'price_adjust') {
          await this.auditProduct(tx, actor, store.id, CATALOG_AUDIT.price, change.product.id, { basePriceCents: change.product.basePriceCents, version: change.product.version }, { basePriceCents: updated.basePriceCents, version: updated.version });
        }
      }
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.bulk', { action: action.type, productIds: changes.map((c) => c.product.id), requested: ids.length });
      await this.auditProduct(tx, actor, store.id, CATALOG_AUDIT.bulk, store.id, null, { action: action.type, ...(adjust ? { mode: adjust.mode, value: action.type === 'price_adjust' ? action.value : null } : {}), requested: ids.length, changed: changes.length }, 'store');
      return { dryRun: false, willChange: changes.length, changed: changes.length, blocked, ...priceResult };
    };
    const result = outer ? await run(outer) : await this.db.transaction(run);
    if (!outer && result.changed > 0) await this.afterBulk(store, ids);
    return result;
  }

  /** Depois do commit da ação em massa: a vitrine reflete o preço e o status novos em até 5 s (DEC-113). */
  async afterBulk(store: Store, productIds: string[]): Promise<void> {
    await this.storefront.productsChanged(store.id, productIds);
  }

  // ----------------------------------------------------------------- planilha

  importTemplate(): string {
    return IMPORT_TEMPLATE;
  }

  /** Categorias ativas e permitidas por nome normalizado (a planilha usa o nome, sem acento nem caixa). */
  private async importCategories(): Promise<Map<string, string>> {
    const rows = await this.db.select().from(categories).where(eq(categories.active, true));
    const forbidden = new Set((await this.db.select({ value: moderationTerms.value }).from(moderationTerms).where(eq(moderationTerms.kind, 'forbidden_category'))).map((r) => r.value));
    const map = new Map<string, string>();
    for (const row of rows) {
      if (forbidden.has(row.id) || (row.parentId && forbidden.has(row.parentId))) continue;
      if (!map.has(normalizeWord(row.name))) map.set(normalizeWord(row.name), row.id);
    }
    return map;
  }

  /**
   * WB-065: `preview` valida e resume ("X válidas, Y com erro", linha e motivo); `commit` cria só as válidas, como rascunho. Mesmo código (SKU) já
   * existente na loja: `skip` ignora e avisa; `update` atualiza preço e estoque.
   *
   * SEC-213: a importação é EDIÇÃO de catálogo. O que lê (categorias, parâmetros, teto) sai ANTES da transação em `prepareImport`; `commitImport` roda só
   * com a transação recebida (cabe em `IdempotencyService.runInTransaction`, DT-094): trava a loja, relê os SKUs sob o lock, respeita o teto de rascunhos
   * (DEC-118) e grava versão e antes/depois como `editProduct` + `auditProduct`.
   */
  async prepareImport(store: Store, csv: string): Promise<PreparedImport> {
    this.assertWritable(store);
    const [categoryMap, variationsMax, maxLines, draftLimit] = await Promise.all([this.importCategories(), this.params.getNumber('variacoes_max'), this.params.getNumber('import_max_linhas'), this.draftLimit()]);
    const plan = planImport(csv, categoryMap, variationsMax, maxLines);
    if ('fileError' in plan) throw errors.unprocessable('IMPORT_FILE_INVALID', 'Planilha inválida', { detail: plan.fileError, errors: [{ field: 'file', message: plan.fileError }] });
    return { plan, draftLimit };
  }

  private async importExisting(executor: DbOrTx, storeId: string, plan: ImportPlan): Promise<Map<string, Variant>> {
    const skus = plan.products.flatMap((p) => p.variants.map((v) => v.sku?.toLowerCase()).filter((s): s is string => Boolean(s)));
    const existing = skus.length > 0 ? await executor.select().from(productVariants).where(and(eq(productVariants.storeId, storeId), eq(productVariants.active, true), inArray(sql`lower(${productVariants.sku})`, skus))) : [];
    return new Map(existing.map((v) => [v.sku!.toLowerCase(), v]));
  }

  private importSummary(plan: ImportPlan, existingBySku: Map<string, Variant>) {
    const alreadyExist = plan.products.filter((p) => p.variants.some((v) => v.sku && existingBySku.has(v.sku.toLowerCase())));
    return { totalLines: plan.totalLines, valid: plan.totalLines - plan.errors.length, invalid: plan.errors.length, errors: plan.errors, productsToCreate: plan.products.length - alreadyExist.length, alreadyExist: alreadyExist.length };
  }

  async importPreview(store: Store, prepared: PreparedImport) {
    return { ...this.importSummary(prepared.plan, await this.importExisting(this.db, store.id, prepared.plan)), committed: false, created: 0, updated: 0, skipped: 0 };
  }

  /** `outer`: transação de quem chama (idempotência transacional); quem a passa invalida a vitrine depois do commit (`afterImport`). Sem ela, abre a própria. */
  async commitImport(store: Store, actor: CatalogActor, prepared: PreparedImport, onExisting: 'skip' | 'update', outer?: Tx) {
    const run = async (tx: Tx) => {
      // I3 + SEC-213: o teto e os SKUs existentes são conferidos sob o lock da loja (duas importações simultâneas não passam do teto nem duplicam o mesmo código).
      await this.stores.lockForCatalogWrite(tx, store.id);
      const existingBySku = await this.importExisting(tx, store.id, prepared.plan);
      const summary = this.importSummary(prepared.plan, existingBySku);
      const hasMatch = (planned: ImportedProduct) => planned.variants.some((v) => v.sku && existingBySku.has(v.sku.toLowerCase()));
      const adding = prepared.plan.products.filter((planned) => !hasMatch(planned)).length;
      if (adding > 0) await this.assertDraftCapacity(tx, store.id, adding, prepared.draftLimit);
      // I9: uma transação por arquivo (tudo ou nada); falha no meio não deixa importação parcial.
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const planned of prepared.plan.products) {
        if (hasMatch(planned)) {
          if (onExisting === 'skip') {
            skipped += 1;
            continue;
          }
          await this.updateFromImport(tx, store, actor, planned, existingBySku);
          updated += 1;
        } else {
          await this.createFromImport(tx, store, planned);
          created += 1;
        }
      }
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.import', { created, updated, skipped, errors: prepared.plan.errors.length });
      return { ...summary, committed: true as const, created, updated, skipped };
    };
    const result = outer ? await run(outer) : await this.db.transaction(run);
    if (!outer) await this.afterImport(store, result);
    return result;
  }

  /** Depois do commit: a vitrine reflete preço e estoque novos em até 5 s (DEC-113). */
  async afterImport(store: Store, result: { created: number; updated: number }): Promise<void> {
    if (result.created + result.updated > 0) await this.storefront.productsChanged(store.id, null);
  }

  async importCsv(store: Store, actor: CatalogActor, csv: string, mode: 'preview' | 'commit', onExisting: 'skip' | 'update') {
    const prepared = await this.prepareImport(store, csv);
    return mode === 'preview' ? this.importPreview(store, prepared) : this.commitImport(store, actor, prepared, onExisting);
  }

  private async createFromImport(tx: Tx, store: Store, planned: ImportedProduct): Promise<void> {
    const [product] = await tx
      .insert(products)
      .values({
        storeId: store.id,
        name: planned.name,
        description: planned.description,
        categoryId: planned.categoryId,
        basePriceCents: planned.basePriceCents,
        promoPriceCents: planned.promoPriceCents,
        promoStartsAt: planned.promoStartsAt,
        promoEndsAt: planned.promoEndsAt,
        variantAttributes: planned.attributeNames,
      })
      .returning();
    if (!product) throw new Error('Falha ao importar produto');
    await tx.insert(productVariants).values(planned.variants.map((v) => ({ productId: product.id, storeId: store.id, attributes: v.attributes, attributesKey: attributesKey(v.attributes), sku: v.sku, stock: v.stock })));
  }

  /**
   * SEC-213: mudar preço ou estoque pela planilha é edição de catálogo: UMA subida de `version` por produto alterado e antes/depois no `audit_log`
   * (`product.price`, `product.stock_adjust`), com `store_id`, na mesma transação. Produto que a planilha deixa igual não é tocado.
   */
  private async updateFromImport(tx: Tx, store: Store, actor: CatalogActor, planned: ImportedProduct, existingBySku: Map<string, Variant>): Promise<void> {
    const productIds = [...new Set(planned.variants.map((v) => (v.sku ? existingBySku.get(v.sku.toLowerCase())?.productId : undefined)).filter((id): id is string => Boolean(id)))].sort();
    for (const productId of productIds) {
      const product = await this.requireProduct(store.id, productId, tx, true);
      const promoOk = product.promoPriceCents === null || planned.basePriceCents > product.promoPriceCents;
      const newPrice = promoOk ? planned.basePriceCents : product.basePriceCents;
      const priceChanged = newPrice !== product.basePriceCents;
      const stockChanges: { variant: Variant; from: number; to: number }[] = [];
      for (const wanted of planned.variants) {
        const old = wanted.sku ? existingBySku.get(wanted.sku.toLowerCase()) : undefined;
        if (!old || old.productId !== productId) continue;
        const [locked] = await tx.select().from(productVariants).where(eq(productVariants.id, old.id)).for('update');
        if (!locked) continue;
        const next = applyAdjust(locked.stock, locked.reserved, { set: wanted.stock });
        if ('stock' in next && next.stock !== locked.stock) {
          await tx.update(productVariants).set({ stock: next.stock, updatedAt: new Date() }).where(eq(productVariants.id, locked.id));
          stockChanges.push({ variant: locked, from: locked.stock, to: next.stock });
        }
      }
      if (!priceChanged && stockChanges.length === 0) continue;
      const edited = await this.editProduct(tx, productId, priceChanged ? { basePriceCents: newPrice } : {});
      if (priceChanged) await this.auditProduct(tx, actor, store.id, CATALOG_AUDIT.price, productId, { basePriceCents: product.basePriceCents, version: product.version }, { basePriceCents: edited.basePriceCents, version: edited.version });
      for (const change of stockChanges) {
        await this.auditProduct(tx, actor, store.id, CATALOG_AUDIT.stock, change.variant.id, { productId, stock: change.from, reserved: change.variant.reserved, version: product.version }, { productId, stock: change.to, reserved: change.variant.reserved, version: edited.version });
      }
    }
  }
}

/** Antes/depois das variações no `audit_log`: só o que o histórico precisa (sem texto livre além dos atributos que o lojista escolheu). */
const variantsAudit = (list: Variant[]) => list.map((v) => ({ id: v.id, attributes: v.attributes, sku: v.sku, priceCents: v.priceCents, stock: v.stock }));

export const reservedError = (reserved: number): AppError =>
  errors.conflict('STOCK_BELOW_RESERVED', 'Estoque abaixo do reservado', `${reserved} ${reserved === 1 ? 'unidade está reservada' : 'unidades estão reservadas'} em pedidos.`);
export const stockRange = (): AppError => errors.unprocessable('STOCK_OUT_OF_RANGE', 'Estoque fora da faixa', { errors: [{ field: 'stock', message: 'Estoque: inteiro de 0 a 99.999.' }] });
const moderatedError = (status: string): AppError =>
  new AppError(403, 'PRODUCT_MODERATED', 'Produto sob moderação', {
    detail: `Esse produto foi ${status === 'removed' ? 'removido' : 'pausado'} pela moderação do Webag. Fale com o suporte para contestar.`,
  });
