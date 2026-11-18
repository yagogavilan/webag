import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { CacheService } from '../../platform/cache/cache.service.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit, type Page } from '../../platform/http/pagination.js';
import { categories } from '../admin/db/schema.js';
import { likeEscape, ProductFeedService, type ProductCard, type ProductSort } from './product-feed.service.js';
import { StoreFeedService, type DiscoveryMode, type FeedStore } from './store-feed.service.js';
import { type GeoPoint, pointKey } from './geo.js';
import { pgArray } from './sql-array.js';

const SECTION_SIZE = 10;
const HOME_TTL_SECONDS = 30;
const MIN_QUERY_LENGTH = 2;

export const presentStoreCard = (store: FeedStore) => ({
  id: store.id,
  name: store.name,
  logo: { urls: store.logo ?? {} },
  mainCategoryId: store.mainCategoryId,
  open: store.open,
  opensAt: store.opensAt,
  distanceM: store.distanceM,
  rating: { average: store.ratingAverage, count: store.ratingCount, isNew: store.isNew },
  delivery: store.deliversHere
    ? { available: true, feeCents: store.feeCents, freeShipping: store.feeCents === 0, freeAboveCents: store.freeAboveCents, minOrderCents: store.minOrderCents, etaMinMinutes: store.etaMinMinutes, etaMaxMinutes: store.etaMaxMinutes }
    : { available: false, feeCents: null, freeShipping: false, freeAboveCents: store.freeAboveCents, minOrderCents: store.minOrderCents, etaMinMinutes: store.etaMinMinutes, etaMaxMinutes: store.etaMaxMinutes },
  pickupEnabled: store.pickupEnabled,
  acceptsExchange: store.acceptsExchange,
});

export const presentProductCard = (product: ProductCard) => ({
  id: product.id,
  name: product.name,
  image: { urls: product.image ?? {} },
  price: { amount: product.priceCents, currency: 'BRL' },
  originalPrice: product.originalPriceCents === null ? null : { amount: product.originalPriceCents, currency: 'BRL' },
  discountPercent: product.discountPercent,
  categoryId: product.categoryId,
  store: product.store,
});

export interface StoreSearchFilters {
  q?: string | undefined;
  categoryId?: string | undefined;
  maxDistanceKm?: number | undefined;
  freeShipping?: boolean | undefined;
  minRating?: number | undefined;
  acceptsExchange?: boolean | undefined;
  sort: 'relevance' | 'distance' | 'rating' | 'fee';
  cursor?: string | undefined;
  limit?: unknown;
}

export interface ProductSearchFilters {
  q?: string | undefined;
  categoryId?: string | undefined;
  minPriceCents?: number | undefined;
  maxPriceCents?: number | undefined;
  maxDistanceKm?: number | undefined;
  freeShipping?: boolean | undefined;
  minRating?: number | undefined;
  acceptsExchange?: boolean | undefined;
  sort: ProductSort;
  cursor?: string | undefined;
  limit?: unknown;
}

/** Home (WB-011, WB-012, WB-036) e busca (WB-013, WB-014) sobre as lojas visíveis no ponto do cliente. */
@Injectable()
export class DiscoveryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly cache: CacheService,
    private readonly stores: StoreFeedService,
    private readonly products: ProductFeedService,
  ) {}

  /** Seções da home. Seção sem item vem vazia e o app a oculta (WB-012 C4); `empty` = nenhuma loja visível. */
  async home(point: GeoPoint, mode: DiscoveryMode) {
    return this.cache.wrap('home', `${mode}:${pointKey(point)}`, HOME_TTL_SECONDS, async () => {
      const feed = await this.stores.at(point, mode);
      const now = new Date();
      const nearby = [...feed].sort((a, b) => StoreFeedService.byRelevance(a, b)).slice(0, SECTION_SIZE);
      const newest = feed
        .filter((store) => StoreFeedService.isRecent(store, now))
        .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))
        .slice(0, SECTION_SIZE);
      const offers = mode === 'delivery' ? await this.products.query(feed, { promoOnly: true, sort: 'discount', offset: 0, limit: SECTION_SIZE }) : [];
      return {
        mode,
        empty: feed.length === 0,
        nearbyStores: nearby.map(presentStoreCard),
        newStores: newest.map(presentStoreCard),
        offers: offers.map(presentProductCard),
        // Mais vendidos (RN-03): precisa de pedidos (Onda 4); até lá a seção vem vazia e é ocultada.
        bestSellers: [] as ReturnType<typeof presentProductCard>[],
        availableCategoryIds: await this.availableCategories(feed),
      };
    });
  }

  /** Categorias com ao menos uma loja visível no ponto, incluindo a categoria-mãe das filhas (WB-011 C4). */
  private async availableCategories(feed: FeedStore[]): Promise<string[]> {
    const ids = [...new Set(feed.flatMap((store) => store.categoryIds))];
    if (ids.length === 0) return [];
    const rows = await this.db.select({ id: categories.id, parentId: categories.parentId }).from(categories).where(and(inArray(categories.id, ids), eq(categories.active, true)));
    return [...new Set(rows.flatMap((row) => (row.parentId ? [row.id, row.parentId] : [row.id])))];
  }

  /** A categoria e as filhas ativas (filtrar por "Moda" inclui "Calçados"). */
  private async categoryScope(categoryId: string): Promise<string[]> {
    const rows = await this.db.select({ id: categories.id }).from(categories).where(and(eq(categories.active, true), or(eq(categories.id, categoryId), eq(categories.parentId, categoryId))));
    return rows.map((row) => row.id);
  }

  /** Filtros comuns de loja (WB-014): distância, entrega grátis, avaliação, aceita troca e categoria (E entre todos). */
  private async eligible(point: GeoPoint, filters: { categoryId?: string | undefined; maxDistanceKm?: number | undefined; freeShipping?: boolean | undefined; minRating?: number | undefined; acceptsExchange?: boolean | undefined }): Promise<FeedStore[]> {
    let feed = await this.stores.at(point, 'delivery');
    if (filters.maxDistanceKm !== undefined) feed = feed.filter((store) => store.distanceM <= filters.maxDistanceKm! * 1000);
    if (filters.freeShipping) feed = feed.filter((store) => store.feeCents === 0);
    if (filters.minRating !== undefined) feed = feed.filter((store) => store.ratingAverage !== null && store.ratingAverage >= filters.minRating!);
    if (filters.acceptsExchange) feed = feed.filter((store) => store.acceptsExchange);
    return feed;
  }

  async searchStores(point: GeoPoint, filters: StoreSearchFilters): Promise<Page<ReturnType<typeof presentStoreCard>>> {
    const limit = parseLimit(filters.limit);
    const offset = decodeCursor<{ o: number }>(filters.cursor)?.o ?? 0;
    let feed = await this.eligible(point, filters);
    if (filters.categoryId) {
      const scope = new Set(await this.categoryScope(filters.categoryId));
      feed = feed.filter((store) => store.categoryIds.some((id) => scope.has(id)));
    }
    const text = filters.q?.trim();
    const scores = new Map<string, number>();
    if (text) {
      const rows = await this.db.execute<{ id: string; score: number }>(sql`
        select s.id, (case when f_norm(s.name) like f_norm(${likeEscape(text)}) || '%' then 3 when f_norm(s.name) like '%' || f_norm(${likeEscape(text)}) || '%' then 2 else 0 end + word_similarity(f_norm(${text}), f_norm(s.name)))::float8 as score
          from stores s
         where s.id = any(${pgArray(feed.map((store) => store.id), 'uuid')})
           and (f_norm(s.name) like '%' || f_norm(${likeEscape(text)}) || '%' ${text.length >= 4 ? sql`or word_similarity(f_norm(${text}), f_norm(s.name)) >= 0.5` : sql``})`);
      for (const row of rows.rows) scores.set(row.id, Number(row.score));
      feed = feed.filter((store) => scores.has(store.id));
    }
    const order: Record<StoreSearchFilters['sort'], (a: FeedStore, b: FeedStore) => number> = {
      relevance: (a, b) => (a.open === b.open ? 0 : a.open ? -1 : 1) || (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || StoreFeedService.byRelevance(a, b),
      distance: (a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name),
      rating: (a, b) => (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) || a.distanceM - b.distanceM,
      fee: (a, b) => (a.feeCents ?? 0) - (b.feeCents ?? 0) || a.distanceM - b.distanceM,
    };
    const sorted = feed.sort(order[filters.sort]);
    const page = sorted.slice(offset, offset + limit);
    return { data: page.map(presentStoreCard), nextCursor: offset + limit < sorted.length ? encodeCursor({ o: offset + limit }) : null };
  }

  async searchProducts(point: GeoPoint, filters: ProductSearchFilters): Promise<Page<ReturnType<typeof presentProductCard>>> {
    const limit = parseLimit(filters.limit);
    const offset = decodeCursor<{ o: number }>(filters.cursor)?.o ?? 0;
    const feed = await this.eligible(point, filters);
    const categoryIds = filters.categoryId ? await this.categoryScope(filters.categoryId) : undefined;
    if (categoryIds && categoryIds.length === 0) return { data: [], nextCursor: null };
    // Busca uma a mais: sobra indica próxima página sem COUNT.
    const rows = await this.products.query(feed, { q: filters.q, categoryIds, minPriceCents: filters.minPriceCents, maxPriceCents: filters.maxPriceCents, sort: filters.sort, offset, limit: limit + 1 });
    return { data: rows.slice(0, limit).map(presentProductCard), nextCursor: rows.length > limit ? encodeCursor({ o: offset + limit }) : null };
  }

  /** Sugestões após 2 caracteres (WB-013 C4): até 5 de cada tipo, só do que o cliente alcança. */
  async suggestions(point: GeoPoint, q: string) {
    const text = q.trim();
    if (text.length < MIN_QUERY_LENGTH) return { products: [], stores: [], categories: [] };
    const feed = await this.stores.at(point, 'delivery');
    const [productRows, categoryRows] = await Promise.all([
      this.products.query(feed, { q: text, sort: 'relevance', offset: 0, limit: 5 }),
      this.db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.active, true), sql`f_norm(${categories.name}) like '%' || f_norm(${likeEscape(text)}) || '%'`)).limit(5),
    ]);
    const needle = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const strip = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return {
      products: productRows.map((product) => ({ id: product.id, name: product.name })),
      stores: feed.filter((store) => strip(store.name).includes(needle)).slice(0, 5).map((store) => ({ id: store.id, name: store.name })),
      categories: categoryRows,
    };
  }
}
