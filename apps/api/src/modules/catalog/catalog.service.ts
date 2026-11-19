import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { AppError, errors, type FieldError } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { lowStockEmail } from '../../platform/mail/templates.js';
import { categories } from '../admin/db/schema.js';
import { isUniqueViolation } from '../admin/util.js';
import { ParametersService } from '../admin/index.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { StoresService, StoreSettingsService, type Store } from '../stores/index.js';
import { moderationTerms, productImages, productModerationEvents, products, productVariants, storeSections, type ModerationStatus, type ProductStatus } from './db/schema.js';
import { IMPORT_TEMPLATE, planImport, type ImportedProduct } from './domain/import.js';
import { matchesSuspectWord, normalizeWord } from './domain/moderation.js';
import { effectivePrice, endOfMinute, MAX_PRICE_CENTS, MIN_PRICE_CENTS, validatePromotion, type Promotion } from './domain/price.js';
import { applyAdjust, available, isLow, isOfferable, lowStockTransition, MAX_STOCK, type StockAdjust } from './domain/stock.js';
import { attributesKey, validateVariantSet, type Attributes } from './domain/variants.js';

export type Product = typeof products.$inferSelect;
export type Variant = typeof productVariants.$inferSelect;

/** Pedidos em andamento de um produto (WB-060 C5). A Onda 4 troca esta implementação pela consulta real. */
export abstract class ProductOrdersPort {
  abstract hasOpenOrders(productId: string): Promise<boolean>;
}

export interface CatalogActor {
  userId: string;
}

const MAX_IMAGES = 8;
const MAX_SECTIONS = 30;
const MAX_BULK = 200;

const priceError = (field: string): AppError =>
  errors.unprocessable('PRICE_OUT_OF_RANGE', 'Preço fora da faixa', { errors: [{ field, message: 'O preço vai de R$ 0,01 a R$ 99.999,99.' }] });

/** Catálogo da loja (WB-060 a WB-066). Toda consulta é escopada pela loja da rota: produto de outra loja é 404 (SEC-020). */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
    private readonly media: MediaService,
    private readonly stores: StoresService,
    private readonly storeSettings: StoreSettingsService,
    private readonly mail: MailService,
    private readonly orders: ProductOrdersPort,
  ) {}

  // ----------------------------------------------------------------- helpers

  /** Só loja aprovada mexe no catálogo (suspensa/recusada/em análise não). */
  private assertWritable(store: Store): void {
    if (store.status !== 'approved') {
      throw errors.conflict('STORE_NOT_APPROVED', 'Loja ainda não aprovada', 'O catálogo é liberado depois da aprovação da loja.');
    }
  }

  private async requireProduct(storeId: string, productId: string, executor: DbOrTx = this.db, lock = false): Promise<Product> {
    const query = executor.select().from(products).where(and(eq(products.id, productId), eq(products.storeId, storeId)));
    const [product] = await (lock ? query.for('update') : query);
    if (!product) throw errors.notFound('Produto não encontrado.');
    return product;
  }

  private async variantsOf(productId: string, executor: DbOrTx = this.db, activeOnly = true): Promise<Variant[]> {
    return executor
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), activeOnly ? eq(productVariants.active, true) : undefined))
      .orderBy(asc(productVariants.createdAt), asc(productVariants.id));
  }

  /** Categoria ativa e fora da lista de proibidas (WB-060 C6). A subcategoria herda a proibição do pai. */
  private async assertCategoryAllowed(categoryId: string, field = 'categoryId'): Promise<void> {
    const [category] = await this.db.select().from(categories).where(eq(categories.id, categoryId));
    if (!category?.active) {
      throw errors.unprocessable('CATEGORY_INACTIVE', 'Categoria indisponível', { errors: [{ field, message: 'Escolha uma categoria ativa.' }] });
    }
    if (await this.isCategoryForbidden(category.id, category.parentId)) {
      throw errors.unprocessable('CATEGORY_FORBIDDEN', 'Tipo de produto não permitido', {
        detail: 'Esse tipo de produto não é permitido no Webag',
        errors: [{ field, message: 'Esse tipo de produto não é permitido no Webag' }],
      });
    }
  }

  async isCategoryForbidden(categoryId: string, parentId: string | null): Promise<boolean> {
    const ids = [categoryId, ...(parentId ? [parentId] : [])];
    const rows = await this.db.select({ id: moderationTerms.id }).from(moderationTerms).where(and(eq(moderationTerms.kind, 'forbidden_category'), inArray(moderationTerms.value, ids)));
    return rows.length > 0;
  }

  private async assertSection(storeId: string, sectionId: string | null | undefined): Promise<void> {
    if (!sectionId) return;
    const [section] = await this.db.select({ id: storeSections.id }).from(storeSections).where(and(eq(storeSections.id, sectionId), eq(storeSections.storeId, storeId)));
    if (!section) throw errors.unprocessable('SECTION_NOT_FOUND', 'Seção não encontrada', { errors: [{ field: 'sectionId', message: 'Escolha uma seção da sua loja.' }] });
  }

  private checkPrice(value: number | null | undefined, field: string): void {
    if (value === null || value === undefined) return;
    if (!Number.isInteger(value) || value < MIN_PRICE_CENTS || value > MAX_PRICE_CENTS) throw priceError(field);
  }

  private promoOf(product: Pick<Product, 'promoPriceCents' | 'promoStartsAt' | 'promoEndsAt'>): Promotion {
    return { promoPriceCents: product.promoPriceCents, promoStartsAt: product.promoStartsAt, promoEndsAt: product.promoEndsAt };
  }

  /** Palavras suspeitas SINALIZAM (nunca bloqueiam): produto novo/editado que casar entra em "Revisar" (WB-107 C3). */
  private async flagIfSuspect(executor: DbOrTx, product: Product, texts: string[]): Promise<boolean> {
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

  private async coverUrls(productIds: string[]): Promise<Map<string, Record<string, string> | null>> {
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

  async present(store: Store, product: Product) {
    const now = new Date();
    const [variants, images, threshold] = await Promise.all([
      this.variantsOf(product.id),
      this.db
        .select({ id: productImages.id, assetId: productImages.assetId, position: productImages.position, asset: mediaAssets })
        .from(productImages)
        .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.assetId))
        .where(eq(productImages.productId, product.id))
        .orderBy(asc(productImages.position)),
      this.storeSettings.lowStockThresholdFor(store.id),
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
    try {
      const created = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(products)
          .values({ storeId: store.id, name: input.name, description: input.description ?? null, categoryId: input.categoryId ?? null, sectionId: input.sectionId ?? null, basePriceCents: input.basePriceCents ?? null, idempotencyKey })
          .returning();
        if (!row) throw new Error('Falha ao criar produto');
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
  ) {
    this.assertWritable(store);
    this.checkPrice(input.basePriceCents, 'basePriceCents');
    this.checkPrice(input.promoPriceCents, 'promoPriceCents');
    if (input.categoryId) await this.assertCategoryAllowed(input.categoryId);
    if (input.sectionId !== undefined) await this.assertSection(store.id, input.sectionId);

    const updated = await this.db.transaction(async (tx) => {
      const current = await this.requireProduct(store.id, productId, tx, true);
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
      const [row] = await tx
        .update(products)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
          ...(input.basePriceCents !== undefined ? { basePriceCents: input.basePriceCents } : {}),
          ...(input.sizeChart !== undefined ? { sizeChart: input.sizeChart || null } : {}),
          ...(input.noVoluntaryExchange !== undefined ? { noVoluntaryExchange: input.noVoluntaryExchange } : {}),
          ...promo,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId))
        .returning();
      if (!row) throw errors.notFound('Produto não encontrado.');
      if (row.status === 'active' && (input.name !== undefined || input.description !== undefined)) await this.flagIfSuspect(tx, row, [row.name, row.description ?? '']);
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_update', { productId, fields: Object.keys(input) });
      return row;
    });
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
        const current = await tx.select().from(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.active, true))).for('update');
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
        await tx.update(products).set({ variantAttributes: input.attributes, updatedAt: new Date() }).where(eq(products.id, product.id));
        await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.variants_set', { productId, count: input.variants.length });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const detail = ((error as { cause?: { constraint?: string }; constraint?: string }).cause?.constraint ?? (error as { constraint?: string }).constraint) ?? '';
        if (detail.includes('sku')) throw errors.unprocessable('SKU_IN_USE', 'Código já usado', { errors: [{ field: 'variants', message: 'Esse código (SKU) já existe em outro produto da loja.' }] });
        throw errors.unprocessable('VARIANTS_INVALID', 'Variações inválidas', { errors: [{ field: 'variants', message: 'Essa combinação já existe' }] });
      }
      throw error;
    }
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

  /** Ajuste rápido (+/-/definir). `FOR UPDATE` na variação: dois "+1" simultâneos dão +2, nunca +1 silencioso (O2-EST-03). */
  async adjustStock(store: Store, actor: CatalogActor, productId: string, variantId: string, adjust: StockAdjust) {
    this.assertWritable(store);
    const result = await this.db.transaction(async (tx) => {
      await this.requireProduct(store.id, productId, tx);
      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), eq(productVariants.active, true)))
        .for('update');
      if (!variant) throw errors.notFound('Variação não encontrada.');
      const next = applyAdjust(variant.stock, variant.reserved, adjust);
      if ('error' in next) throw next.error === 'below_reserved' ? reservedError(variant.reserved) : stockRange();
      await tx.update(productVariants).set({ stock: next.stock, updatedAt: new Date() }).where(eq(productVariants.id, variantId));
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.stock_adjust', { productId, variantId, from: variant.stock, to: next.stock });
      return { variant, stock: next.stock };
    });
    const changed = [{ variant: result.variant, available: available(result.stock, result.variant.reserved) }];
    await this.sendLowStock(store, changed);
    const product = await this.requireProduct(store.id, productId);
    return (await this.present(store, product)).variants.find((v) => v.id === variantId);
  }

  // ------------------------------------------------------------------- imagens

  async setImages(store: Store, actor: CatalogActor, productId: string, imageIds: string[]) {
    this.assertWritable(store);
    if (new Set(imageIds).size !== imageIds.length) throw errors.validation([{ field: 'imageIds', message: 'Foto repetida.' }]);
    if (imageIds.length > MAX_IMAGES) throw errors.unprocessable('TOO_MANY_IMAGES', 'Fotos demais', { errors: [{ field: 'imageIds', message: `No máximo ${MAX_IMAGES} fotos por produto.` }] });
    for (const id of imageIds) await this.media.requireReady(id, { storeId: store.id, purposes: ['product_image'] });
    await this.db.transaction(async (tx) => {
      const product = await this.requireProduct(store.id, productId, tx, true);
      if (product.status === 'active' && imageIds.length === 0) throw errors.unprocessable('IMAGE_REQUIRED', 'Foto obrigatória', { errors: [{ field: 'imageIds', message: 'Produto ativo precisa de ao menos 1 foto.' }] });
      await tx.delete(productImages).where(eq(productImages.productId, productId));
      if (imageIds.length > 0) await tx.insert(productImages).values(imageIds.map((assetId, position) => ({ productId, assetId, position })));
      await tx.update(products).set({ updatedAt: new Date() }).where(eq(products.id, productId));
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.images_set', { productId, count: imageIds.length });
    });
    return this.present(store, await this.requireProduct(store.id, productId));
  }

  // ------------------------------------------------- publicar, pausar, arquivar

  /** Publica (WB-060 C1/C3/C4): lista TODOS os campos que faltam, por campo, num único 422. */
  async publish(store: Store, actor: CatalogActor, productId: string) {
    this.assertWritable(store);
    const published = await this.db.transaction(async (tx) => {
      const product = await this.requireProduct(store.id, productId, tx, true);
      if (product.moderationStatus === 'paused' || product.moderationStatus === 'removed') throw moderatedError(product.moderationStatus);
      if (product.status === 'active') return product;
      if (product.status === 'archived') throw errors.conflict('PRODUCT_ARCHIVED', 'Produto arquivado', 'Produto arquivado não volta à vitrine.');
      const issues: FieldError[] = [];
      if (!product.name || product.name.trim().length < 2) issues.push({ field: 'name', message: 'Informe o nome.' });
      if (!product.categoryId) issues.push({ field: 'categoryId', message: 'Escolha a categoria.' });
      if (product.basePriceCents === null) issues.push({ field: 'basePriceCents', message: 'Informe o preço.' });
      const [images] = await tx.select({ total: sql<number>`count(*)::int` }).from(productImages).where(eq(productImages.productId, productId));
      if ((images?.total ?? 0) < 1) issues.push({ field: 'imageIds', message: 'Envie ao menos 1 foto.' });
      if ((await this.variantsOf(productId, tx)).length < 1) issues.push({ field: 'variants', message: 'Cadastre ao menos 1 variação (ou "sem variação" com estoque).' });
      if (issues.length > 0) throw errors.unprocessable('PRODUCT_INCOMPLETE', 'Produto incompleto', { errors: issues });
      if (product.categoryId) await this.assertCategoryAllowed(product.categoryId);
      const [row] = await tx.update(products).set({ status: 'active', publishedAt: product.publishedAt ?? new Date(), updatedAt: new Date() }).where(eq(products.id, productId)).returning();
      await this.flagIfSuspect(tx, row ?? product, [product.name, product.description ?? '']);
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_publish', { productId });
      return row ?? product;
    });
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
      await tx.update(products).set({ status: to, updatedAt: new Date() }).where(eq(products.id, productId));
      await this.stores.logActivity(tx, store.id, actor.userId, action, { productId });
    });
  }

  /** "Excluir" = arquivar: some da vitrine e do painel, o histórico de pedidos mantém nome e preço (WB-060 C5). */
  async archive(store: Store, actor: CatalogActor, productId: string): Promise<void> {
    this.assertWritable(store);
    await this.db.transaction(async (tx) => {
      const product = await this.requireProduct(store.id, productId, tx, true);
      if (product.status === 'archived') return;
      if (await this.orders.hasOpenOrders(productId)) throw errors.conflict('OPEN_ORDERS', 'Há pedidos em andamento', 'Há pedidos em andamento com este produto. Pause o produto e tente depois.');
      await tx.update(products).set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() }).where(eq(products.id, productId));
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.product_archive', { productId });
    });
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

  /**
   * WB-066: pausar, reativar, mover de seção ou ajustar preço (+/-% ou +/- R$). Ajuste que levaria algum preço a <= 0 ou
   * acima do máximo bloqueia a ação INTEIRA e lista os afetados. `dryRun` só mostra o que mudaria.
   */
  async bulk(
    store: Store,
    actor: CatalogActor,
    input: { productIds: string[]; dryRun: boolean; action: { type: 'pause' } | { type: 'resume' } | { type: 'move_section'; sectionId: string | null } | { type: 'price_adjust'; mode: 'percent' | 'amount'; value: number } },
  ) {
    this.assertWritable(store);
    const ids = [...new Set(input.productIds)];
    if (ids.length > MAX_BULK) throw errors.validation([{ field: 'productIds', message: `No máximo ${MAX_BULK} produtos por vez.` }]);
    if (input.action.type === 'price_adjust' && input.action.mode === 'amount' && !Number.isInteger(input.action.value)) throw errors.validation([{ field: 'action.value', message: 'Em reais, informe centavos inteiros.' }]);
    if (input.action.type === 'move_section') await this.assertSection(store.id, input.action.sectionId);
    const action = input.action;

    const outcome = await this.db.transaction(async (tx) => {
      const rows = await tx.select().from(products).where(and(inArray(products.id, ids), eq(products.storeId, store.id))).for('update');
      // Produto de outra loja (ou inexistente) é 404 para o pedido inteiro: não revela quais ids existem (SEC-020).
      if (rows.length !== ids.length) throw errors.notFound('Produto não encontrado.');
      const blocked: { productId: string; name: string; reason: string }[] = [];
      const changes: { product: Product; patch: Partial<typeof products.$inferInsert>; variantPrices?: { id: string; priceCents: number }[] }[] = [];
      for (const product of rows) {
        if (action.type === 'pause') {
          if (product.status === 'active') changes.push({ product, patch: { status: 'paused' } });
        } else if (action.type === 'resume') {
          if (product.moderationStatus === 'paused' || product.moderationStatus === 'removed') blocked.push({ productId: product.id, name: product.name, reason: 'Produto pausado ou removido pela moderação.' });
          else if (product.status === 'paused') changes.push({ product, patch: { status: 'active' } });
        } else if (action.type === 'move_section') {
          if (product.sectionId !== action.sectionId) changes.push({ product, patch: { sectionId: action.sectionId } });
        } else {
          if (product.basePriceCents === null) {
            blocked.push({ productId: product.id, name: product.name, reason: 'Produto sem preço.' });
            continue;
          }
          const next = adjustPrice(product.basePriceCents, action);
          if (next < MIN_PRICE_CENTS || next > MAX_PRICE_CENTS) {
            blocked.push({ productId: product.id, name: product.name, reason: next < MIN_PRICE_CENTS ? 'O preço ficaria menor que R$ 0,01.' : 'O preço ficaria acima de R$ 99.999,99.' });
            continue;
          }
          if (product.promoPriceCents !== null && next <= product.promoPriceCents) {
            blocked.push({ productId: product.id, name: product.name, reason: 'O novo preço ficaria menor ou igual ao preço promocional.' });
            continue;
          }
          const variants = await this.variantsOf(product.id, tx);
          const variantPrices: { id: string; priceCents: number }[] = [];
          for (const variant of variants) {
            if (variant.priceCents === null) continue;
            const adjusted = adjustPrice(variant.priceCents, action);
            if (adjusted < MIN_PRICE_CENTS || adjusted > MAX_PRICE_CENTS) {
              blocked.push({ productId: product.id, name: product.name, reason: `O preço da variação ${Object.values(variant.attributes).join(' / ')} sairia da faixa.` });
              variantPrices.length = 0;
              break;
            }
            variantPrices.push({ id: variant.id, priceCents: adjusted });
          }
          if (!blocked.some((b) => b.productId === product.id)) changes.push({ product, patch: { basePriceCents: next }, variantPrices });
        }
      }
      if (blocked.length > 0 || input.dryRun) return { blocked, willChange: changes.length, applied: false };
      for (const change of changes) {
        await tx.update(products).set({ ...change.patch, updatedAt: new Date() }).where(eq(products.id, change.product.id));
        for (const variant of change.variantPrices ?? []) await tx.update(productVariants).set({ priceCents: variant.priceCents, updatedAt: new Date() }).where(eq(productVariants.id, variant.id));
      }
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.bulk', { action: action.type, productIds: changes.map((c) => c.product.id), requested: ids.length });
      return { blocked, willChange: changes.length, applied: true };
    });
    if (outcome.blocked.length > 0 && !input.dryRun) {
      throw new AppError(422, 'BULK_BLOCKED', 'Ação bloqueada', { detail: `${outcome.blocked.length} produto(s) impedem a ação. Nada foi alterado.`, errors: outcome.blocked.map((b) => ({ field: b.productId, message: `${b.name}: ${b.reason}` })) });
    }
    return { dryRun: input.dryRun, willChange: outcome.willChange, changed: outcome.applied ? outcome.willChange : 0, blocked: outcome.blocked };
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
   * WB-065: `preview` valida e resume ("X válidas, Y com erro", linha e motivo); `commit` cria só as válidas, como
   * rascunho. Mesmo código (SKU) já existente na loja: `skip` ignora e avisa; `update` atualiza preço e estoque.
   */
  async importCsv(store: Store, actor: CatalogActor, csv: string, mode: 'preview' | 'commit', onExisting: 'skip' | 'update') {
    this.assertWritable(store);
    const plan = planImport(csv, await this.importCategories(), await this.params.getNumber('variacoes_max'));
    if ('fileError' in plan) throw errors.unprocessable('IMPORT_FILE_INVALID', 'Planilha inválida', { detail: plan.fileError, errors: [{ field: 'file', message: plan.fileError }] });

    const skus = plan.products.flatMap((p) => p.variants.map((v) => v.sku?.toLowerCase()).filter((s): s is string => Boolean(s)));
    const existing = skus.length > 0 ? await this.db.select().from(productVariants).where(and(eq(productVariants.storeId, store.id), eq(productVariants.active, true), inArray(sql`lower(${productVariants.sku})`, skus))) : [];
    const existingBySku = new Map(existing.map((v) => [v.sku!.toLowerCase(), v]));
    const alreadyExist = plan.products.filter((p) => p.variants.some((v) => v.sku && existingBySku.has(v.sku.toLowerCase())));
    const summary = { totalLines: plan.totalLines, valid: plan.totalLines - plan.errors.length, invalid: plan.errors.length, errors: plan.errors, productsToCreate: plan.products.length - alreadyExist.length, alreadyExist: alreadyExist.length };
    if (mode === 'preview') return { ...summary, committed: false, created: 0, updated: 0, skipped: 0 };

    // I9: uma transação por arquivo (tudo ou nada); falha no meio não deixa importação parcial.
    const counts = await this.db.transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const planned of plan.products) {
        const matches = planned.variants.filter((v) => v.sku && existingBySku.has(v.sku.toLowerCase()));
        if (matches.length > 0) {
          if (onExisting === 'skip') {
            skipped += 1;
            continue;
          }
          await this.updateFromImport(tx, store, planned, existingBySku);
          updated += 1;
        } else {
          await this.createFromImport(tx, store, planned);
          created += 1;
        }
      }
      await this.stores.logActivity(tx, store.id, actor.userId, 'catalog.import', { created, updated, skipped, errors: plan.errors.length });
      return { created, updated, skipped };
    });
    return { ...summary, committed: true, ...counts };
  }

  private async createFromImport(tx: DbOrTx, store: Store, planned: ImportedProduct): Promise<void> {
    {
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
  }

  private async updateFromImport(tx: DbOrTx, store: Store, planned: ImportedProduct, existingBySku: Map<string, Variant>): Promise<void> {
    {
      const productIds = new Set(planned.variants.map((v) => (v.sku ? existingBySku.get(v.sku.toLowerCase())?.productId : undefined)).filter((id): id is string => Boolean(id)));
      for (const productId of productIds) {
        const product = await this.requireProduct(store.id, productId, tx, true);
        const promoOk = product.promoPriceCents === null || planned.basePriceCents > product.promoPriceCents;
        await tx.update(products).set({ basePriceCents: promoOk ? planned.basePriceCents : product.basePriceCents, updatedAt: new Date() }).where(eq(products.id, productId));
      }
      for (const wanted of planned.variants) {
        const old = wanted.sku ? existingBySku.get(wanted.sku.toLowerCase()) : undefined;
        if (!old) continue;
        const [locked] = await tx.select().from(productVariants).where(eq(productVariants.id, old.id)).for('update');
        if (!locked) continue;
        const next = applyAdjust(locked.stock, locked.reserved, { set: wanted.stock });
        if ('stock' in next) await tx.update(productVariants).set({ stock: next.stock, updatedAt: new Date() }).where(eq(productVariants.id, locked.id));
      }
    }
  }
}

/** Ajuste em % (arredonda ao centavo) ou em centavos (positivo ou negativo). */
function adjustPrice(cents: number, action: { mode: 'percent' | 'amount'; value: number }): number {
  return action.mode === 'percent' ? Math.round(cents * (1 + action.value / 100)) : cents + action.value;
}

const reservedError = (reserved: number): AppError =>
  errors.conflict('STOCK_BELOW_RESERVED', 'Estoque abaixo do reservado', `${reserved} ${reserved === 1 ? 'unidade está reservada' : 'unidades estão reservadas'} em pedidos.`);
const stockRange = (): AppError => errors.unprocessable('STOCK_OUT_OF_RANGE', 'Estoque fora da faixa', { errors: [{ field: 'stock', message: 'Estoque: inteiro de 0 a 99.999.' }] });
const moderatedError = (status: string): AppError =>
  new AppError(403, 'PRODUCT_MODERATED', 'Produto sob moderação', {
    detail: `Esse produto foi ${status === 'removed' ? 'removido' : 'pausado'} pela moderação do Webag. Fale com o suporte para contestar.`,
  });
