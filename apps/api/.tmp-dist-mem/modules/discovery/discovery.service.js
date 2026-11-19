var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { CacheService } from '../../platform/cache/cache.service.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { categories } from '../admin/db/schema.js';
import { likeEscape, ProductFeedService } from './product-feed.service.js';
import { StoreFeedService } from './store-feed.service.js';
import { pointKey } from './geo.js';
import { presentEta } from '../logistics/index.js';
import { pgArray } from './sql-array.js';
const SECTION_SIZE = 10;
const BEST_SELLER_DAYS = 30;
const BEST_SELLER_MIN_ORDERS = 5;
const HOME_TTL_SECONDS = 30;
const MIN_QUERY_LENGTH = 2;
export const presentStoreCard = (store) => ({
    id: store.id,
    name: store.name,
    logo: { urls: store.logo ?? {} },
    mainCategoryId: store.mainCategoryId,
    open: store.open,
    opensAt: store.opensAt,
    distanceM: store.distanceM,
    rating: { average: store.ratingAverage, count: store.ratingCount, isNew: store.isNew },
    delivery: store.deliversHere
        ? { available: store.logisticsOpen, logisticsOpensAt: store.logisticsOpen ? null : store.logisticsOpensAt, feeCents: store.feeCents, freeShipping: store.feeCents === 0, freeAboveCents: store.freeAboveCents, minOrderCents: store.minOrderCents, etaMinMinutes: store.etaMinMinutes, etaMaxMinutes: store.etaMaxMinutes, eta: presentEta({ minMinutes: store.etaMinMinutes, maxMinutes: store.etaMaxMinutes }, new Date()) }
        : { available: false, feeCents: null, freeShipping: false, freeAboveCents: store.freeAboveCents, minOrderCents: store.minOrderCents, etaMinMinutes: store.etaMinMinutes, etaMaxMinutes: store.etaMaxMinutes, eta: null },
    pickupEnabled: store.pickupEnabled,
    acceptsExchange: store.acceptsExchange,
});
export const presentProductCard = (product) => ({
    id: product.id,
    name: product.name,
    image: { urls: product.image ?? {} },
    price: { amount: product.priceCents, currency: 'BRL' },
    originalPrice: product.originalPriceCents === null ? null : { amount: product.originalPriceCents, currency: 'BRL' },
    discountPercent: product.discountPercent,
    categoryId: product.categoryId,
    store: { ...product.store, eta: presentEta({ minMinutes: product.store.etaMinMinutes, maxMinutes: product.store.etaMaxMinutes }, new Date()) },
});
/** Home (WB-011, WB-012, WB-036) e busca (WB-013, WB-014) sobre as lojas visíveis no ponto do cliente. */
let DiscoveryService = class DiscoveryService {
    db;
    cache;
    stores;
    products;
    constructor(db, cache, stores, products) {
        this.db = db;
        this.cache = cache;
        this.stores = stores;
        this.products = products;
    }
    /** Seções da home. Seção sem item vem vazia e o app a oculta (WB-012 C4); `empty` = nenhuma loja visível. */
    async home(point, mode) {
        return this.cache.wrap('home', `${mode}:${pointKey(point)}`, HOME_TTL_SECONDS, async () => {
            const feed = await this.stores.at(point, mode);
            const now = new Date();
            const nearby = [...feed].sort((a, b) => StoreFeedService.byRelevance(a, b)).slice(0, SECTION_SIZE);
            const newest = feed
                .filter((store) => StoreFeedService.isRecent(store, now))
                .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))
                .slice(0, SECTION_SIZE);
            const offers = mode === 'delivery' ? await this.products.query(feed, { promoOnly: true, sort: 'discount', offset: 0, limit: SECTION_SIZE }) : [];
            const highlights = await this.highlights(feed, mode, now);
            return {
                mode,
                empty: feed.length === 0,
                /** Destaques fixados pelo admin (WB-115 C4): vêm ANTES dos critérios automáticos; só itens visíveis neste ponto. */
                highlightStores: highlights.stores.map(presentStoreCard),
                highlightProducts: highlights.products.map(presentProductCard),
                nearbyStores: nearby.map(presentStoreCard),
                newStores: newest.map(presentStoreCard),
                offers: offers.map(presentProductCard),
                // Mais vendidos (RN-03, BUG-018): produtos com pelo menos 5 pedidos pagos nos últimos 30 dias nas lojas desta região, por unidades.
                bestSellers: mode === 'delivery' ? (await this.bestSellers(feed, now)).map(presentProductCard) : [],
                availableCategoryIds: await this.availableCategories(feed),
            };
        });
    }
    /** RN-03: unidades em pedidos pagos (não cancelados) dos últimos 30 dias, só de produtos com 5+ pedidos, nas lojas visíveis no ponto. */
    async bestSellers(feed, now) {
        if (feed.length === 0)
            return [];
        const since = new Date(now.getTime() - BEST_SELLER_DAYS * 86_400_000);
        const rows = await this.db.execute(sql `
      select oi.product_id, sum(oi.quantity)::int as units
        from order_items oi
        join orders o on o.id = oi.order_id
       where o.store_id = any(${pgArray(feed.map((s) => s.id), 'uuid')})
         and o.paid_at >= ${since.toISOString()}::timestamptz
         and o.status not in ('cancelled', 'refused', 'expired', 'awaiting_payment')
       group by oi.product_id
      having count(distinct o.id) >= ${BEST_SELLER_MIN_ORDERS}
       order by units desc, oi.product_id
       limit ${SECTION_SIZE * 3}`);
        if (rows.rows.length === 0)
            return [];
        const rank = new Map(rows.rows.map((r, i) => [r.product_id, i]));
        const cards = await this.products.query(feed, { productIds: [...rank.keys()], sort: 'relevance', offset: 0, limit: rank.size });
        return cards.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)).slice(0, SECTION_SIZE);
    }
    async highlights(feed, mode, now) {
        const rows = await this.db.execute(sql `
      select h.kind, h.target_id from home_highlights h
      where h.active and h.starts_at <= ${now.toISOString()}::timestamptz and h.ends_at > ${now.toISOString()}::timestamptz
        and (h.city_id is null or h.city_id = (case h.kind
          when 'store' then (select s.address_city_id from stores s where s.id = h.target_id)
          else (select s.address_city_id from products p join stores s on s.id = p.store_id where p.id = h.target_id) end))
      order by h.position, h.created_at limit 12`);
        const storeIds = rows.rows.filter((r) => r.kind === 'store').map((r) => r.target_id);
        const productIds = rows.rows.filter((r) => r.kind === 'product').map((r) => r.target_id);
        const byId = new Map(feed.map((store) => [store.id, store]));
        const stores = storeIds.map((id) => byId.get(id)).filter((store) => store !== undefined);
        const products = mode === 'delivery' && productIds.length > 0 ? await this.products.query(feed, { productIds, sort: 'relevance', offset: 0, limit: productIds.length }) : [];
        const rank = new Map(productIds.map((id, index) => [id, index]));
        return { stores, products: [...products].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)) };
    }
    /** Categorias com ao menos uma loja visível no ponto, incluindo a categoria-mãe das filhas (WB-011 C4). */
    async availableCategories(feed) {
        const ids = [...new Set(feed.flatMap((store) => store.categoryIds))];
        if (ids.length === 0)
            return [];
        const rows = await this.db.select({ id: categories.id, parentId: categories.parentId }).from(categories).where(and(inArray(categories.id, ids), eq(categories.active, true)));
        return [...new Set(rows.flatMap((row) => (row.parentId ? [row.id, row.parentId] : [row.id])))];
    }
    /** A categoria e as filhas ativas (filtrar por "Moda" inclui "Calçados"). */
    async categoryScope(categoryId) {
        const rows = await this.db.select({ id: categories.id }).from(categories).where(and(eq(categories.active, true), or(eq(categories.id, categoryId), eq(categories.parentId, categoryId))));
        return rows.map((row) => row.id);
    }
    /** Filtros comuns de loja (WB-014): distância, entrega grátis, avaliação, aceita troca e categoria (E entre todos). */
    async eligible(point, filters) {
        let feed = await this.stores.at(point, 'delivery');
        if (filters.maxDistanceKm !== undefined)
            feed = feed.filter((store) => store.distanceM <= filters.maxDistanceKm * 1000);
        if (filters.freeShipping)
            feed = feed.filter((store) => store.feeCents === 0);
        if (filters.minRating !== undefined)
            feed = feed.filter((store) => store.ratingAverage !== null && store.ratingAverage >= filters.minRating);
        if (filters.acceptsExchange)
            feed = feed.filter((store) => store.acceptsExchange);
        return feed;
    }
    async searchStores(point, filters) {
        const limit = parseLimit(filters.limit);
        const offset = decodeCursor(filters.cursor)?.o ?? 0;
        let feed = await this.eligible(point, filters);
        if (filters.categoryId) {
            const scope = new Set(await this.categoryScope(filters.categoryId));
            feed = feed.filter((store) => store.categoryIds.some((id) => scope.has(id)));
        }
        const text = filters.q?.trim();
        const scores = new Map();
        if (text) {
            const rows = await this.db.execute(sql `
        select s.id, (case when f_norm(s.name) like f_norm(${likeEscape(text)}) || '%' then 3 when f_norm(s.name) like '%' || f_norm(${likeEscape(text)}) || '%' then 2 else 0 end + word_similarity(f_norm(${text}), f_norm(s.name)))::float8 as score
          from stores s
         where s.id = any(${pgArray(feed.map((store) => store.id), 'uuid')})
           and (f_norm(s.name) like '%' || f_norm(${likeEscape(text)}) || '%' ${text.length >= 4 ? sql `or word_similarity(f_norm(${text}), f_norm(s.name)) >= 0.5` : sql ``})`);
            for (const row of rows.rows)
                scores.set(row.id, Number(row.score));
            feed = feed.filter((store) => scores.has(store.id));
        }
        const order = {
            relevance: (a, b) => (a.open === b.open ? 0 : a.open ? -1 : 1) || (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || StoreFeedService.byRelevance(a, b),
            distance: (a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name),
            rating: (a, b) => (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) || a.distanceM - b.distanceM,
            fee: (a, b) => (a.feeCents ?? 0) - (b.feeCents ?? 0) || a.distanceM - b.distanceM,
            eta: (a, b) => a.etaMinMinutes + a.etaMaxMinutes - (b.etaMinMinutes + b.etaMaxMinutes) || a.distanceM - b.distanceM || a.name.localeCompare(b.name),
        };
        const sorted = feed.sort(order[filters.sort]);
        const page = sorted.slice(offset, offset + limit);
        return { data: page.map(presentStoreCard), nextCursor: offset + limit < sorted.length ? encodeCursor({ o: offset + limit }) : null };
    }
    async searchProducts(point, filters) {
        const limit = parseLimit(filters.limit);
        const offset = decodeCursor(filters.cursor)?.o ?? 0;
        const feed = await this.eligible(point, filters);
        const categoryIds = filters.categoryId ? await this.categoryScope(filters.categoryId) : undefined;
        if (categoryIds && categoryIds.length === 0)
            return { data: [], nextCursor: null };
        // Busca uma a mais: sobra indica próxima página sem COUNT.
        const rows = await this.products.query(feed, { q: filters.q, categoryIds, minPriceCents: filters.minPriceCents, maxPriceCents: filters.maxPriceCents, sort: filters.sort, offset, limit: limit + 1 });
        return { data: rows.slice(0, limit).map(presentProductCard), nextCursor: rows.length > limit ? encodeCursor({ o: offset + limit }) : null };
    }
    /** Sugestões após 2 caracteres (WB-013 C4): até 5 de cada tipo, só do que o cliente alcança. */
    async suggestions(point, q) {
        const text = q.trim();
        if (text.length < MIN_QUERY_LENGTH)
            return { products: [], stores: [], categories: [] };
        const feed = await this.stores.at(point, 'delivery');
        const [productRows, categoryRows] = await Promise.all([
            this.products.query(feed, { q: text, sort: 'relevance', offset: 0, limit: 5 }),
            this.db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.active, true), sql `f_norm(${categories.name}) like '%' || f_norm(${likeEscape(text)}) || '%'`)).limit(5),
        ]);
        const needle = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const strip = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        return {
            products: productRows.map((product) => ({ id: product.id, name: product.name })),
            stores: feed.filter((store) => strip(store.name).includes(needle)).slice(0, 5).map((store) => ({ id: store.id, name: store.name })),
            categories: categoryRows,
        };
    }
};
DiscoveryService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, CacheService,
        StoreFeedService,
        ProductFeedService])
], DiscoveryService);
export { DiscoveryService };
//# sourceMappingURL=discovery.service.js.map