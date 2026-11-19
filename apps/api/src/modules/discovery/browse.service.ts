import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { ParametersService } from '../admin/index.js';
import { productImages, products, productVariants, storeSections } from '../catalog/db/schema.js';
import { effectivePrice } from '../catalog/domain/price.js';
import { DeliveryFeesService } from '../logistics/index.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { users } from '../identity/db/schema.js';
import { stores, storeSettings } from '../stores/db/schema.js';
import { maskDocument } from '../stores/domain/document.js';
import { StoreSettingsService } from '../stores/index.js';
import { hoursToday, isOpen, nextOpening, type OpeningInput } from '../stores/index.js';
import { reviews } from './db/schema.js';
import type { GeoPoint } from './geo.js';

const LAST_UNITS_MAX = 3;
const REVIEWS_PAGE = 10;

type Money = { amount: number; currency: 'BRL' };
const money = (amount: number): Money => ({ amount, currency: 'BRL' });

/** Páginas públicas da loja e do produto (WB-016, WB-017, WB-018). Loja fechada é visível e navegável (DEC-022). */
@Injectable()
export class BrowseService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly media: MediaService,
    private readonly params: ParametersService,
    private readonly settings: StoreSettingsService,
    private readonly fees: DeliveryFeesService,
  ) {}

  /** Loja visível (RN-03: aprovada, conta de recebimento ativa, produto ativo); qualquer outra coisa é 404. */
  private async visibleStore(storeId: string) {
    const [row] = await this.db
      .select({ store: stores, settings: storeSettings })
      .from(stores)
      .innerJoin(storeSettings, eq(storeSettings.storeId, stores.id))
      .where(
        and(
          eq(stores.id, storeId),
          eq(stores.status, 'approved'),
          sql`exists (select 1 from payment_accounts pa where pa.store_id = ${stores.id} and pa.status = 'active')`,
          sql`exists (select 1 from products p where p.store_id = ${stores.id} and p.status = 'active' and p.moderation_status in ('ok', 'review'))`,
        ),
      );
    if (!row) throw errors.notFound('Loja não encontrada.');
    return row;
  }

  private async openingOf(storeId: string, pausedUntil: Date | null, pausedIndefinitely: boolean, now: Date) {
    const [hours, holidays] = await Promise.all([this.settings.weeklyHours(storeId), this.settings.holidays(storeId)]);
    const input: OpeningInput = { hours, holidays: new Set(holidays.map((h) => h.date)), pausedUntil, pausedIndefinitely };
    const open = isOpen(input, now);
    return { open, opensAt: open ? null : (nextOpening(input, now)?.toISOString() ?? null), hoursToday: hoursToday(input, now) };
  }

  private async ratingOf(where: SQL) {
    const [row] = await this.db
      .select({ avg: sql<number | null>`avg(${reviews.rating})::float8`, count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(and(where, eq(reviews.status, 'published')));
    const min = await this.params.getNumber('avaliacao_min_exibicao');
    const count = row?.count ?? 0;
    return { average: count >= min && row?.avg != null ? Math.round(row.avg * 10) / 10 : null, count, isNew: count < min };
  }

  private urls(asset: typeof mediaAssets.$inferSelect | undefined | null) {
    return { urls: (asset ? this.media.publicVariants(asset) : null) ?? {} };
  }

  async store(storeId: string, point: GeoPoint | null) {
    const { store, settings } = await this.visibleStore(storeId);
    const now = new Date();
    const [opening, rating, sections, assets, quote] = await Promise.all([
      this.openingOf(store.id, settings.pausedUntil, settings.pausedIndefinitely, now),
      this.ratingOf(and(eq(reviews.storeId, store.id), sql`${reviews.productId} is null`)!),
      this.db.select().from(storeSections).where(eq(storeSections.storeId, store.id)).orderBy(asc(storeSections.position)),
      this.db.select().from(mediaAssets).where(inArray(mediaAssets.id, [store.logoAssetId, store.coverAssetId].filter((id): id is string => id !== null))),
      point ? this.fees.quote(store.id, { ...point, cityId: store.addressCityId ?? null }, 0) : null,
    ]);
    const byId = new Map(assets.map((a) => [a.id, a]));
    const pickupMax = await this.params.getNumber('retirada_distancia_max_km');
    const pickupNear = quote?.distanceM != null && quote.distanceM <= pickupMax * 1000;
    return {
      id: store.id,
      name: store.name,
      description: store.description,
      logo: this.urls(store.logoAssetId ? byId.get(store.logoAssetId) : null),
      cover: this.urls(store.coverAssetId ? byId.get(store.coverAssetId) : null),
      mainCategoryId: store.mainCategoryId,
      rating,
      ...opening,
      delivery: {
        // Sem posição, só os dados da loja; com posição, o que vale para ela (a mesma conta do checkout).
        available: quote?.available ?? null,
        distanceM: quote?.distanceM == null ? null : Math.round(quote.distanceM),
        feeCents: quote?.feeCents ?? null,
        freeShipping: quote?.freeShipping ?? false,
        // Mínimo e entrega grátis são globais do admin (DEC-036b).
        freeAboveCents: await this.params.getNumber('frete_gratis_acima_cents'),
        minOrderCents: await this.params.getNumber('pedido_minimo_cents'),
        etaMinMinutes: settings.etaMinMinutes,
        etaMaxMinutes: settings.etaMaxMinutes,
        acceptsDelivery: settings.acceptsDelivery,
      },
      pickup: {
        enabled: settings.pickupEnabled,
        // "Retirar na loja" quando não entrega e a loja está a até `retirada_distancia_max_km` (WB-016 C4).
        offered: settings.pickupEnabled && (quote === null || pickupNear),
        address: settings.pickupEnabled ? (settings.pickupUseStoreAddress ? `${store.addressStreet}, ${store.addressNumber} - ${store.addressNeighborhood}, ${store.addressCityName}` : settings.pickupAddress) : null,
        instructions: settings.pickupEnabled ? settings.pickupInstructions : null,
        prepMinMinutes: settings.pickupPrepMinMinutes,
        prepMaxMinutes: settings.pickupPrepMaxMinutes,
      },
      exchangePolicy: { voluntaryDays: settings.voluntaryExchangeDays, collectionFeeCents: settings.collectionFeeCents, version: settings.exchangePolicyVersion },
      // Identificação do fornecedor (WB-016 C6): documento mascarado; a validação jurídica do texto está pendente.
      supplier: {
        name: store.legalName ?? store.name,
        documentType: store.documentType,
        documentMasked: maskDocument(store.documentNumber),
        address: { street: store.addressStreet, number: store.addressNumber, neighborhood: store.addressNeighborhood, city: store.addressCityName, state: store.addressState },
      },
      sections: sections.map((section) => ({ id: section.id, name: section.name })),
    };
  }

  /** Vitrine da loja: disponíveis primeiro, na ordem das seções e dos produtos; sem estoque ao final como "Indisponível". */
  async storeProducts(storeId: string, filters: { sectionId?: string | undefined; cursor?: string | undefined; limit?: unknown }) {
    await this.visibleStore(storeId);
    const limit = parseLimit(filters.limit);
    const offset = decodeCursor<{ o: number }>(filters.cursor)?.o ?? 0;
    const result = await this.db.execute<{ id: string; name: string; section_id: string | null; base_price_cents: number; promo_price_cents: number | null; promo_starts_at: Date | null; promo_ends_at: Date | null; free: number }>(sql`
      select p.id, p.name, p.section_id, p.base_price_cents, p.promo_price_cents, p.promo_starts_at, p.promo_ends_at,
             coalesce((select sum(greatest(v.stock - v.reserved, 0)) from product_variants v where v.product_id = p.id and v.active), 0)::int as free
        from products p
        left join store_sections sec on sec.id = p.section_id
       where p.store_id = ${storeId} and p.status = 'active' and p.moderation_status in ('ok', 'review') and p.base_price_cents is not null
         ${filters.sectionId ? sql`and p.section_id = ${filters.sectionId}` : sql``}
       order by (coalesce((select sum(greatest(v.stock - v.reserved, 0)) from product_variants v where v.product_id = p.id and v.active), 0) > 0) desc,
                sec.position asc nulls last, p.position asc, p.id asc
       limit ${limit + 1} offset ${offset}`);
    const rows = result.rows;
    const covers = await this.covers(rows.slice(0, limit).map((r) => r.id));
    const now = new Date();
    return {
      data: rows.slice(0, limit).map((row) => {
        const price = effectivePrice(row.base_price_cents, null, { promoPriceCents: row.promo_price_cents, promoStartsAt: row.promo_starts_at ? new Date(row.promo_starts_at) : null, promoEndsAt: row.promo_ends_at ? new Date(row.promo_ends_at) : null }, now);
        return {
          id: row.id,
          name: row.name,
          sectionId: row.section_id,
          image: { urls: covers.get(row.id) ?? {} },
          price: money(price.priceCents),
          originalPrice: price.originalCents === null ? null : money(price.originalCents),
          discountPercent: price.discountPct,
          available: Number(row.free) > 0,
        };
      }),
      nextCursor: rows.length > limit ? encodeCursor({ o: offset + limit }) : null,
    };
  }

  private async covers(productIds: string[]): Promise<Map<string, Record<string, string>>> {
    const map = new Map<string, Record<string, string>>();
    if (productIds.length === 0) return map;
    const rows = await this.db
      .select({ productId: productImages.productId, asset: mediaAssets })
      .from(productImages)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.assetId))
      .where(and(inArray(productImages.productId, productIds), eq(productImages.position, 0)));
    for (const row of rows) map.set(row.productId, this.media.publicVariants(row.asset) ?? {});
    return map;
  }

  /**
   * Página do produto. Pausado ou removido pela moderação responde 200 com `available: false` e o atalho da loja
   * (WB-017 C6); rascunho, arquivado ou de loja invisível é 404. Estoque exato não sai: só "últimas X unidades".
   */
  async product(productId: string) {
    const [product] = await this.db.select().from(products).where(eq(products.id, productId));
    if (!product || !['active', 'paused'].includes(product.status) || product.basePriceCents === null) throw errors.notFound('Produto não encontrado.');
    const { store, settings } = await this.visibleStore(product.storeId);
    const now = new Date();
    const unavailableReason = product.status === 'paused' ? 'PAUSED' : product.moderationStatus === 'paused' || product.moderationStatus === 'removed' ? 'MODERATED' : null;
    const storeSummary = { id: store.id, name: store.name, ...(await this.openingOf(store.id, settings.pausedUntil, settings.pausedIndefinitely, now)) };
    if (unavailableReason) return { id: product.id, name: product.name, available: false, unavailableReason, store: storeSummary };

    const [variants, images, rating, maxQty] = await Promise.all([
      this.db.select().from(productVariants).where(and(eq(productVariants.productId, product.id), eq(productVariants.active, true))).orderBy(asc(productVariants.createdAt), asc(productVariants.attributesKey)),
      this.db.select({ id: productImages.assetId, position: productImages.position, asset: mediaAssets }).from(productImages).innerJoin(mediaAssets, eq(mediaAssets.id, productImages.assetId)).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.position)),
      this.ratingOf(eq(reviews.productId, product.id)),
      this.params.getNumber('item_qtd_max'),
    ]);
    const promo = { promoPriceCents: product.promoPriceCents, promoStartsAt: product.promoStartsAt, promoEndsAt: product.promoEndsAt };
    const views = variants.map((variant) => {
      const free = Math.max(variant.stock - variant.reserved, 0);
      const price = effectivePrice(product.basePriceCents!, variant.priceCents, promo, now);
      return {
        id: variant.id,
        attributes: variant.attributes,
        price: money(price.priceCents),
        originalPrice: price.originalCents === null ? null : money(price.originalCents),
        discountPercent: price.discountPct,
        available: free > 0,
        maxQuantity: Math.min(free, maxQty),
        lastUnits: free > 0 && free <= LAST_UNITS_MAX ? free : null,
      };
    });
    const base = effectivePrice(product.basePriceCents, null, promo, now);
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      // WB-246: tabela de medidas do lojista; WB-244: produto sem troca voluntária (tamanho/cor inertes).
      sizeChart: product.sizeChart,
      acceptsVoluntaryExchange: !product.noVoluntaryExchange,
      categoryId: product.categoryId,
      available: views.some((v) => v.available),
      unavailableReason: views.some((v) => v.available) ? null : 'SOLD_OUT',
      price: money(base.priceCents),
      originalPrice: base.originalCents === null ? null : money(base.originalCents),
      discountPercent: base.discountPct,
      variantAttributes: product.variantAttributes,
      variants: views,
      images: images.map((image) => ({ id: image.id, position: image.position, urls: this.media.publicVariants(image.asset) ?? {} })),
      rating,
      store: storeSummary,
    };
  }

  /** Avaliações lidas (WB-018): mais recentes primeiro, 10 por página, só publicadas, nome reduzido (LGPD). */
  async reviewsOf(target: { storeId: string } | { productId: string }, filters: { cursor?: string | undefined; limit?: unknown }) {
    let storeId: string;
    let scope: SQL;
    if ('storeId' in target) {
      await this.visibleStore(target.storeId);
      storeId = target.storeId;
      scope = and(eq(reviews.storeId, storeId), sql`${reviews.productId} is null`)!;
    } else {
      const [product] = await this.db.select({ storeId: products.storeId, status: products.status }).from(products).where(eq(products.id, target.productId));
      if (!product || product.status === 'draft' || product.status === 'archived') throw errors.notFound('Produto não encontrado.');
      await this.visibleStore(product.storeId);
      scope = eq(reviews.productId, target.productId);
    }
    const limit = Math.min(Math.max(Number(filters.limit ?? REVIEWS_PAGE) || REVIEWS_PAGE, 1), 50);
    const cursor = decodeCursor<{ at: string; id: string }>(filters.cursor);
    const summary = await this.ratingOf(scope);
    const rows = await this.db
      .select({ review: reviews, name: users.name })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(and(scope, eq(reviews.status, 'published'), cursor ? or(lt(reviews.createdAt, new Date(cursor.at)), and(eq(reviews.createdAt, new Date(cursor.at)), lt(reviews.id, cursor.id))) : undefined))
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      summary,
      data: page.map(({ review, name }) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        fit: review.fit,
        reviewer: shortName(name),
        verifiedPurchase: review.orderId !== null,
        createdAt: review.createdAt.toISOString(),
        storeReply: review.storeReply,
        storeRepliedAt: review.storeRepliedAt?.toISOString() ?? null,
      })),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: last.review.createdAt.toISOString(), id: last.review.id }) : null,
    };
  }
}

/** "Maria Aparecida Souza" vira "Maria S.": só o primeiro nome e a inicial do último (minimização, LGPD). */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts.at(-1) : null;
  return last ? `${first} ${last.slice(0, 1).toUpperCase()}.` : first;
}
