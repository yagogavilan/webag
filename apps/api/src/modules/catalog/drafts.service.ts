import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors, type FieldError } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore } from '../../platform/http/pagination.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { ParametersService } from '../admin/index.js';
import { categories } from '../admin/db/schema.js';
import { IdempotencyService } from '../idempotency/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { StoresService, type Store } from '../stores/index.js';
import { StorefrontCacheService } from '../../platform/cache/storefront-cache.service.js';
import { CATALOG_AUDIT, CatalogService, type CatalogActor, type Product } from './catalog.service.js';
import { productImages, products, productVariants, type ProductVia } from './db/schema.js';
import { copyName, draftExpiresAt, draftExpiresInDays, missingFields, type MissingField } from './domain/draft.js';
import { cleanLine, cleanMultiline } from './domain/text.js';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from './domain/price.js';
import { attributesKey, validateVariantSet } from './domain/variants.js';

const SWEEP_MS = 10 * 60_000;
/** Lote colado: 10 por hora por loja `[HIPÓTESE]` (contrato `createProductDraftsBatch`). */
const BATCH_PER_HOUR = 10;

export type DraftBatchRejection = 'NAME_REQUIRED' | 'NAME_TOO_LONG' | 'PRICE_OUT_OF_RANGE' | 'QUANTITY_OUT_OF_RANGE' | 'VARIANTS_INVALID' | 'CATEGORY_FORBIDDEN';

interface BatchItem {
  clientRef: string;
  name: string;
  basePriceCents?: number | null | undefined;
  quantity?: number | undefined;
  variantAttributes?: string[] | undefined;
  variants?: { attributes: Record<string, string>; stock: number; priceCents?: number | null | undefined }[] | undefined;
  categoryId?: string | null | undefined;
}

/**
 * Cadastro rápido, lado do servidor (WB-370, 371, 372, 376 lote; ADR-018 D1, D16): rascunho como linha de `products`, lote colado, duplicar, "publicar em 2 campos"
 * (`quickPublishProduct`) e o vencimento de 30 dias. Toda escrita com `Idempotency-Key` roda por `IdempotencyService.runInTransaction` (SEC-208): chave, efeito e resposta
 * no mesmo commit. O teto de rascunhos é contado e inserido sob o lock da loja (I3). Efeitos colaterais (cache da vitrine, log) saem DEPOIS do commit.
 */
@Injectable()
export class ProductDraftsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ProductDraftsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly catalog: CatalogService,
    private readonly stores: StoresService,
    private readonly params: ParametersService,
    private readonly idempotency: IdempotencyService,
    private readonly limiter: RateLimitService,
    private readonly storefront: StorefrontCacheService,
  ) {}

  onApplicationBootstrap(): void {
    // RN-Q2: vencido em 30 dias sem alteração. Apagar é idempotente (duas réplicas apagam o mesmo conjunto), então o intervalo em processo basta (DT-079).
    if (process.env.NODE_ENV === 'test') return; // os testes chamam `sweepExpired` direto
    this.timer = setInterval(() => void this.sweepExpired().catch((error: Error) => this.logger.error(`vencimento de rascunhos: ${error.message}`)), SWEEP_MS).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Apaga os rascunhos parados há mais que `rascunho_validade_dias` (RN-Q2). Variações, fotos e medição vão junto (cascata). Devolve quantos. */
  async sweepExpired(now = new Date()): Promise<number> {
    const days = await this.params.getNumber('rascunho_validade_dias');
    const limit = new Date(now.getTime() - days * 86_400_000);
    const rows = await this.db
      .delete(products)
      .where(and(eq(products.status, 'draft'), lt(products.updatedAt, limit)))
      .returning({ id: products.id });
    if (rows.length > 0) this.logger.log({ event: 'product.draft_expired', count: rows.length });
    return rows.length;
  }

  // ------------------------------------------------------------------- leitura

  /** Regras de descrição por categoria (a própria e a mãe) numa consulta só, para a lista de rascunhos não fazer 1 consulta por linha. */
  private async descriptionRules(categoryIds: (string | null)[]): Promise<Map<string, { minChars: number }>> {
    const ids = [...new Set(categoryIds.filter((id): id is string => id !== null))];
    const result = new Map<string, { minChars: number }>();
    if (ids.length === 0) return result;
    const rows = await this.db.select().from(categories).where(or(inArray(categories.id, ids), inArray(categories.id, sql`(select parent_id from categories where id = any(${ids}::uuid[]) and parent_id is not null)`)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of ids) {
      const own = byId.get(id);
      const parent = own?.parentId ? byId.get(own.parentId) : undefined;
      const mins = [own, parent].filter((c) => c?.descriptionRequired).map((c) => c!.descriptionMinChars);
      if (mins.length > 0) result.set(id, { minChars: Math.max(...mins) });
    }
    return result;
  }

  private async summaries(rows: Product[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [photos, variantsCount, covers, rules, validityDays] = await Promise.all([
      this.db.select({ productId: productImages.productId, total: count() }).from(productImages).where(inArray(productImages.productId, ids)).groupBy(productImages.productId),
      this.db.select({ productId: productVariants.productId, total: count() }).from(productVariants).where(and(inArray(productVariants.productId, ids), eq(productVariants.active, true))).groupBy(productVariants.productId),
      this.catalog.coverUrls(ids),
      this.descriptionRules(rows.map((row) => row.categoryId)),
      this.params.getNumber('rascunho_validade_dias'),
    ]);
    const photoBy = new Map(photos.map((p) => [p.productId, p.total]));
    const variantBy = new Map(variantsCount.map((v) => [v.productId, v.total]));
    const now = new Date();
    return rows.map((row) => {
      const expiresAt = draftExpiresAt(row.updatedAt, validityDays);
      return {
        id: row.id,
        name: row.name,
        basePriceCents: row.basePriceCents,
        cover: covers.get(row.id) ?? null,
        missing: missingFields({
          name: row.name,
          basePriceCents: row.basePriceCents,
          categoryId: row.categoryId,
          description: row.description,
          photoCount: photoBy.get(row.id) ?? 0,
          activeVariantCount: variantBy.get(row.id) ?? 0,
          descriptionRule: row.categoryId ? (rules.get(row.categoryId) ?? null) : null,
        }),
        updatedAt: row.updatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        expiresInDays: draftExpiresInDays(expiresAt, now),
        version: row.version,
        via: (row.via ?? 'form') satisfies ProductVia,
      };
    });
  }

  private async draftCount(storeId: string): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(products).where(and(eq(products.storeId, storeId), eq(products.status, 'draft')));
    return row?.total ?? 0;
  }

  /** WB-371: aba "Rascunhos (n)". Mais recentes primeiro, cursor por (alteração, id). */
  async list(store: Store, query: { cursor?: string | undefined; limit?: unknown }) {
    this.catalog.assertWritable(store);
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const rows = await this.db
      .select()
      .from(products)
      .where(and(eq(products.storeId, store.id), eq(products.status, 'draft'), timestampCursorBefore(products.updatedAt, products.id, cursor)))
      .orderBy(sql`date_trunc('milliseconds', ${products.updatedAt}) desc`, desc(products.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const [data, total, draftLimit] = await Promise.all([this.summaries(page), this.draftCount(store.id), this.params.getNumber('rascunhos_max_por_loja')]);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.updatedAt.toISOString(), id: last.id }) : null, count: total, limit: draftLimit };
  }

  /** WB-370/371: tudo que a tela de Produtos e o "Novo produto" precisam numa chamada (3G). */
  async quickStart(store: Store) {
    this.catalog.assertWritable(store);
    const [draftLimit, variantsMax, reajusteMaxPct, total, latest, recent, noDescription] = await Promise.all([
      this.params.getNumber('rascunhos_max_por_loja'),
      this.params.getNumber('variacoes_max'),
      this.params.getNumber('reajuste_max_pct'),
      this.draftCount(store.id),
      this.db.select().from(products).where(and(eq(products.storeId, store.id), eq(products.status, 'draft'))).orderBy(desc(products.updatedAt), desc(products.id)).limit(1),
      // Categoria sugerida: a última usada pela loja (categoria ativa), fora das proibidas.
      this.db
        .select({ categoryId: products.categoryId })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(and(eq(products.storeId, store.id), sql`${products.status} <> 'archived'`, eq(categories.active, true)))
        .groupBy(products.categoryId)
        .orderBy(sql`max(${products.updatedAt}) desc`)
        .limit(5),
      this.db.select({ total: count() }).from(products).where(and(eq(products.storeId, store.id), eq(products.status, 'active'), or(isNull(products.description), eq(products.description, '')))),
    ]);
    let suggestedCategoryId: string | null = null;
    for (const row of recent) {
      if (!row.categoryId) continue;
      const [category] = await this.db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, row.categoryId));
      if (!(await this.catalog.isCategoryForbidden(row.categoryId, category?.parentId ?? null))) {
        suggestedCategoryId = row.categoryId;
        break;
      }
    }
    return {
      suggestedCategoryId,
      draftCount: total,
      draftLimit,
      latestDraft: latest[0] ? ((await this.summaries(latest))[0] ?? null) : null,
      withoutDescriptionCount: noDescription[0]?.total ?? 0,
      limits: { variantsMax, reajusteMaxPct },
    };
  }

  // ------------------------------------------------------------------ escrita

  private scope(route: string, store: Store, actor: CatalogActor): string {
    return `${route}:${store.id}:${actor.userId}`;
  }

  /** WB-370 C1: o rascunho nasce ANTES da câmera (a aba pode ser descarregada ao voltar dela): só a via, nome e preço opcionais. */
  async createDraft(store: Store, actor: CatalogActor, input: { via: ProductVia; name?: string | undefined; categoryId?: string | null | undefined; basePriceCents?: number | null | undefined }, idempotencyKey: string) {
    this.catalog.assertWritable(store);
    this.catalog.checkPrice(input.basePriceCents, 'basePriceCents');
    if (input.categoryId) await this.catalog.assertCategoryAllowed(input.categoryId);
    const name = cleanLine(input.name ?? '');
    if ([...name].length > 80) throw errors.validation([{ field: 'name', message: 'O nome vai até 80 caracteres.' }]);
    return this.idempotency.runInTransaction(this.scope('draft', store, actor), idempotencyKey, input, async (tx) => {
      await this.catalog.assertDraftCapacity(tx, store.id, 1);
      const [row] = await tx
        .insert(products)
        .values({ storeId: store.id, name, categoryId: input.categoryId ?? null, basePriceCents: input.basePriceCents ?? null, status: 'draft', via: input.via })
        .returning();
      if (!row) throw new Error('Falha ao criar rascunho');
      await this.catalog.startMetrics(tx, store.id, [row.id], input.via);
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.draft_create', { productId: row.id, via: input.via });
      return this.catalog.present(store, row, tx);
    });
  }

  /** Valida UM item do lote; devolve o motivo da recusa (linha ruim não derruba as outras) ou os dados prontos para gravar. */
  private async checkBatchItem(item: BatchItem, forbiddenCache: Map<string, Promise<boolean>>, maxVariants: number): Promise<{ reject: { code: DraftBatchRejection; message: string } } | { ok: { name: string; price: number | null; categoryId: string | null; attributes: string[]; variants: { attributes: Record<string, string>; stock: number; priceCents: number | null }[] } }> {
    const name = cleanLine(item.name);
    if (name.length === 0) return { reject: { code: 'NAME_REQUIRED', message: 'Falta o nome.' } };
    if ([...name].length > 80) return { reject: { code: 'NAME_TOO_LONG', message: 'O nome vai até 80 caracteres.' } };
    const price = item.basePriceCents ?? null;
    if (price !== null && (price < MIN_PRICE_CENTS || price > MAX_PRICE_CENTS)) return { reject: { code: 'PRICE_OUT_OF_RANGE', message: 'O preço vai de R$ 0,01 a R$ 99.999,99.' } };
    const stocks = [item.quantity, ...(item.variants ?? []).map((v) => v.stock)].filter((n): n is number => n !== undefined);
    if (stocks.some((n) => !Number.isInteger(n) || n < 0 || n > 99_999)) return { reject: { code: 'QUANTITY_OUT_OF_RANGE', message: 'A quantidade vai de 0 a 99.999.' } };
    if ((item.variants ?? []).some((v) => v.priceCents !== null && v.priceCents !== undefined && (v.priceCents < MIN_PRICE_CENTS || v.priceCents > MAX_PRICE_CENTS))) {
      return { reject: { code: 'PRICE_OUT_OF_RANGE', message: 'O preço de uma variação sai da faixa.' } };
    }
    let attributes: string[] = [];
    let variants: { attributes: Record<string, string>; stock: number; priceCents: number | null }[];
    if (item.variants && item.variants.length > 0) {
      attributes = (item.variantAttributes ?? []).map(cleanLine);
      variants = item.variants.map((v) => ({ attributes: Object.fromEntries(Object.entries(v.attributes).map(([k, val]) => [cleanLine(k), cleanLine(val)])), stock: v.stock, priceCents: v.priceCents ?? null }));
      const issues = validateVariantSet(attributes, variants.map((v) => ({ attributes: v.attributes, stock: v.stock, priceCents: v.priceCents, sku: null })), maxVariants);
      if (issues.length > 0) return { reject: { code: 'VARIANTS_INVALID', message: issues[0]!.message } };
    } else {
      variants = [{ attributes: {}, stock: item.quantity ?? 1, priceCents: null }];
    }
    let categoryId: string | null = null;
    if (item.categoryId) {
      const cached = forbiddenCache.get(item.categoryId) ?? this.categoryBlocked(item.categoryId);
      forbiddenCache.set(item.categoryId, cached);
      if (await cached) return { reject: { code: 'CATEGORY_FORBIDDEN', message: 'Esse tipo de produto não é permitido no Webag' } };
      categoryId = item.categoryId;
    }
    return { ok: { name, price, categoryId, attributes, variants } };
  }

  /** Categoria que NÃO serve ao cadastro: inexistente, inativa ou proibida (o contrato de linha só tem `CATEGORY_FORBIDDEN`; a mensagem é a mesma). */
  private async categoryBlocked(categoryId: string): Promise<boolean> {
    try {
      await this.catalog.assertCategoryAllowed(categoryId);
      return false;
    } catch (error) {
      if (error instanceof AppError && error.getStatus() === 422) return true;
      throw error;
    }
  }

  /**
   * WB-376 C4: cria rascunhos do lote colado (até 100; a leitura do texto é no aparelho, D3). **Atômico quanto ao teto** (DEC-118): `rascunhos + itens` acima do teto =
   * nada criado e 422 `DRAFT_LIMIT_REACHED` com `slotsAvailable`. Linha ruim vai em `rejected` e as boas são criadas.
   */
  async createBatch(store: Store, actor: CatalogActor, input: { via: 'paste' | 'spreadsheet'; items: BatchItem[] }, idempotencyKey: string) {
    this.catalog.assertWritable(store);
    const refs = input.items.map((item) => item.clientRef);
    if (new Set(refs).size !== refs.length) throw errors.validation([{ field: 'items', message: 'Cada linha precisa de um clientRef diferente.' }]);
    await this.limiter.enforce(`rl:draft-batch:${store.id}`, BATCH_PER_HOUR, 3600);
    const maxVariants = await this.params.getNumber('variacoes_max');
    const forbiddenCache = new Map<string, Promise<boolean>>();
    const checked = await Promise.all(input.items.map((item) => this.checkBatchItem(item, forbiddenCache, maxVariants)));
    const result = await this.idempotency.runInTransaction(this.scope('draft-batch', store, actor), idempotencyKey, input, async (tx) => {
      await this.catalog.assertDraftCapacity(tx, store.id, input.items.length);
      const valid = checked.flatMap((outcome, index) => ('ok' in outcome ? [{ item: input.items[index]!, data: outcome.ok }] : []));
      const rejected = checked.flatMap((outcome, index) => ('reject' in outcome ? [{ clientRef: input.items[index]!.clientRef, code: outcome.reject.code, message: outcome.reject.message }] : []));
      if (valid.length === 0) return { created: [], rejected };
      const inserted = await tx
        .insert(products)
        .values(valid.map(({ data }) => ({ storeId: store.id, name: data.name, categoryId: data.categoryId, basePriceCents: data.price, variantAttributes: data.attributes, status: 'draft' as const, via: input.via })))
        .returning({ id: products.id });
      // `returning` mantém a ordem do `values` no PostgreSQL; a conferência abaixo falha alto se algum dia deixar de manter.
      if (inserted.length !== valid.length) throw new Error('lote de rascunhos: contagem inesperada');
      await tx.insert(productVariants).values(
        valid.flatMap(({ data }, index) =>
          data.variants.map((variant) => ({ productId: inserted[index]!.id, storeId: store.id, attributes: variant.attributes, attributesKey: attributesKey(variant.attributes), priceCents: variant.priceCents, stock: variant.stock })),
        ),
      );
      await this.catalog.startMetrics(tx, store.id, inserted.map((row) => row.id), input.via);
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.draft_batch', { created: inserted.length, rejected: rejected.length, via: input.via });
      const created = valid.map(({ item, data }, index) => ({
        clientRef: item.clientRef,
        productId: inserted[index]!.id,
        missing: ['photo', ...(data.price === null ? ['price'] : []), ...(data.categoryId === null ? ['category'] : [])] as MissingField[],
      }));
      return { created, rejected };
    });
    this.logger.log({ event: 'paste_import_confirmed', storeId: store.id, lines_ok: result.created.length, lines_error: result.rejected.length });
    return result;
  }

  /** WB-372 / RN-Q4: duplica como RASCUNHO. Não copia foto, SKU, código de barras, estoque (1 por variação, ou 0 em grade) nem promoção; a cópia nasce sem moderação herdada. */
  async duplicate(store: Store, actor: CatalogActor, productId: string, idempotencyKey: string) {
    this.catalog.assertWritable(store);
    const result = await this.idempotency.runInTransaction(this.scope('duplicate', store, actor), idempotencyKey, { productId }, async (tx) => {
      // C6 (C-CAD-10): a posse do produto de ORIGEM é conferida (outra loja = inexistente = 404), antes de qualquer coisa ser criada.
      const source = await this.catalog.requireProduct(store.id, productId, tx);
      await this.catalog.assertDraftCapacity(tx, store.id, 1);
      const sourceVariants = await this.catalog.variantsOf(source.id, tx);
      const grid = source.variantAttributes.length > 0;
      const [row] = await tx
        .insert(products)
        .values({
          storeId: store.id,
          name: copyName(source.name),
          description: source.description,
          sizeChart: source.sizeChart,
          noVoluntaryExchange: source.noVoluntaryExchange,
          categoryId: source.categoryId,
          sectionId: source.sectionId,
          basePriceCents: source.basePriceCents,
          variantAttributes: source.variantAttributes,
          status: 'draft',
          via: 'duplicate',
          duplicatedFrom: source.id,
        })
        .returning();
      if (!row) throw new Error('Falha ao duplicar produto');
      const copies = sourceVariants.length > 0 ? sourceVariants : [];
      if (copies.length > 0) {
        await tx.insert(productVariants).values(copies.map((v) => ({ productId: row.id, storeId: store.id, attributes: v.attributes, attributesKey: v.attributesKey, priceCents: v.priceCents, sku: null, stock: grid ? 0 : 1 })));
      }
      await this.catalog.startMetrics(tx, store.id, [row.id], 'duplicate');
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_duplicate', { productId: row.id, duplicatedFrom: source.id });
      // C5: o histórico registra "duplicado de <id>" (nome da cópia, sem a foto nem o estoque).
      await this.catalog.auditProduct(tx, actor, store.id, CATALOG_AUDIT.duplicate, row.id, null, { duplicatedFrom: source.id, name: row.name, variants: copies.length });
      return this.catalog.present(store, row, tx);
    });
    this.logger.log({ event: 'product_duplicated', storeId: store.id });
    return result;
  }

  /** Asset de foto pronto da loja; ainda em processamento vira 422 `UPLOAD_NOT_READY` (transitório: o app espera e repete com a MESMA chave). */
  private async requireUploadsReady(storeId: string, imageIds: string[]): Promise<void> {
    const rows = await this.db.select().from(mediaAssets).where(inArray(mediaAssets.id, imageIds));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const pending: FieldError[] = [];
    for (const id of imageIds) {
      const asset = byId.get(id);
      // Outra loja, outra finalidade ou inexistente: 404 igual (não revela que o arquivo existe).
      if (!asset || asset.storeId !== storeId || asset.purpose !== 'product_image') throw errors.notFound('Arquivo não encontrado.');
      if (asset.status === 'pending') pending.push({ field: 'imageIds', message: id });
      else if (asset.status !== 'ready') throw errors.unprocessable('MEDIA_NOT_USABLE', 'Arquivo não pode ser usado aqui', { detail: 'Esse envio foi recusado. Envie a foto de novo.' });
    }
    if (pending.length > 0) {
      throw new AppError(422, 'UPLOAD_NOT_READY', 'Foto ainda sendo enviada', { detail: 'A foto ainda está sendo processada. Aguarde alguns segundos.', retryAfterSeconds: 2, errors: pending });
    }
  }

  /**
   * D16 / I11: "publicar em 2 campos" numa transação (nome, preço, categoria, descrição, fotos, estoque da variação padrão e publicação), UMA edição de catálogo (a versão sobe 1 vez).
   * Tudo ou nada. As regras são as de `updateProduct` + `publishProduct`. Só produto SEM grade; com grade é 422 `QUICK_PUBLISH_NOT_APPLICABLE`.
   */
  async quickPublish(
    store: Store,
    actor: CatalogActor,
    productId: string,
    input: { name: string; basePriceCents: number; categoryId?: string | null | undefined; description?: string | null | undefined; stock: number; imageIds: string[] },
    ifMatch: number | null,
    idempotencyKey: string,
  ) {
    this.catalog.assertWritable(store);
    if (new Set(input.imageIds).size !== input.imageIds.length) throw errors.validation([{ field: 'imageIds', message: 'Foto repetida.' }]);
    const maxImages = await this.params.getNumber('foto_max_produto');
    if (input.imageIds.length > maxImages) throw errors.unprocessable('TOO_MANY_IMAGES', 'Fotos demais', { errors: [{ field: 'imageIds', message: `No máximo ${maxImages} fotos por produto.` }] });
    this.catalog.checkPrice(input.basePriceCents, 'basePriceCents');
    await this.requireUploadsReady(store.id, input.imageIds);

    const published: { event: { via: string; durationS: number } | null } = { event: null };
    const outcome = await this.idempotency.runInTransaction(this.scope('quick-publish', store, actor), idempotencyKey, { productId, ifMatch, ...input }, async (tx) => {
      const product = await this.catalog.requireProduct(store.id, productId, tx, true);
      this.catalog.assertVersion(product, ifMatch);
      if (product.moderationStatus === 'paused' || product.moderationStatus === 'removed') {
        throw new AppError(403, 'PRODUCT_MODERATED', 'Produto sob moderação', { detail: `Esse produto foi ${product.moderationStatus === 'removed' ? 'removido' : 'pausado'} pela moderação do Webag. Fale com o suporte para contestar.` });
      }
      if (product.status === 'archived') throw errors.conflict('PRODUCT_ARCHIVED', 'Produto arquivado', 'Produto arquivado não volta à vitrine.');
      const current = await this.catalog.variantsOf(productId, tx);
      if (product.variantAttributes.length > 0 || current.some((v) => Object.keys(v.attributes).length > 0)) {
        throw errors.unprocessable('QUICK_PUBLISH_NOT_APPLICABLE', 'Use a grade de variações', { detail: 'Este produto tem variações. Salve as variações e publique pelo formulário completo.' });
      }
      const name = cleanLine(input.name);
      if ([...name].length < 2) throw errors.unprocessable('PRODUCT_INCOMPLETE', 'Produto incompleto', { errors: [{ field: 'name', message: 'Informe o nome (2 a 80 caracteres).' }] });
      const categoryId = input.categoryId ?? product.categoryId;
      if (!categoryId) throw errors.unprocessable('PRODUCT_INCOMPLETE', 'Produto incompleto', { errors: [{ field: 'categoryId', message: 'Escolha a categoria.' }] });
      await this.catalog.assertCategoryAllowed(categoryId);
      const description = input.description !== undefined ? (input.description === null ? null : cleanMultiline(input.description)) : product.description;
      await this.catalog.assertDescription(categoryId, description, tx);

      const edited = await this.catalog.editProduct(tx, productId, { name, basePriceCents: input.basePriceCents, categoryId, description: description === '' ? null : description, variantAttributes: [], status: 'active', publishedAt: product.publishedAt ?? new Date() });
      await tx.delete(productImages).where(eq(productImages.productId, productId));
      await tx.insert(productImages).values(input.imageIds.map((assetId, position) => ({ productId, assetId, position })));
      const base = current.find((v) => Object.keys(v.attributes).length === 0);
      if (base) await tx.update(productVariants).set({ stock: input.stock, active: true, updatedAt: new Date() }).where(eq(productVariants.id, base.id));
      else await tx.insert(productVariants).values({ productId, storeId: store.id, attributes: {}, attributesKey: attributesKey({}), stock: input.stock });
      await this.catalog.flagIfSuspect(tx, edited, [edited.name, edited.description ?? '']);
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_quick_publish', { productId });
      await this.catalog.auditProduct(tx, actor, store.id, CATALOG_AUDIT.quickPublish, productId, { name: product.name, status: product.status, basePriceCents: product.basePriceCents, categoryId: product.categoryId, version: product.version }, { name: edited.name, status: edited.status, basePriceCents: edited.basePriceCents, categoryId: edited.categoryId, imageIds: input.imageIds, stock: input.stock, version: edited.version });
      // WB-379: `photo_captured` e `product_create_published` (só tempos e contagens, sem texto do produto).
      await this.catalog.markFirstPhoto(tx, productId);
      published.event = await this.catalog.markPublished(tx, productId, input.imageIds.length, 1);
      return this.catalog.present(store, edited, tx);
    });
    this.catalog.logPublished(store.id, published.event, input.imageIds.length, 1);
    await this.storefront.productsChanged(store.id, [productId]);
    return outcome;
  }
}
