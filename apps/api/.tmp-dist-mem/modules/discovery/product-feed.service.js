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
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { effectivePrice } from '../catalog/domain/price.js';
import { productImages } from '../catalog/db/schema.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { pgArray } from './sql-array.js';
/** Texto do usuário vira padrão LIKE seguro (`%`, `_` e `\` literais) e sem acento/caixa (mesma `f_norm` dos índices). */
export const likeEscape = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);
/** Preço vigente do produto em SQL (promoção dentro da janela, RN-05). Usa o instante do banco. */
const EFFECTIVE_PRICE = sql `case when p.promo_price_cents is not null and p.promo_price_cents < p.base_price_cents and now() >= p.promo_starts_at and now() <= p.promo_ends_at then p.promo_price_cents else p.base_price_cents end`;
const PROMO_ACTIVE = sql `(p.promo_price_cents is not null and p.promo_price_cents < p.base_price_cents and now() >= p.promo_starts_at and now() <= p.promo_ends_at)`;
/**
 * Produtos que o cliente vê (RN-03): ativo, não pausado/removido pela moderação, de loja visível no ponto e com 1+
 * variação com disponível > 0 (sem estoque só aparece na página da loja). Ofertas e busca usam a mesma consulta.
 */
let ProductFeedService = class ProductFeedService {
    db;
    media;
    constructor(db, media) {
        this.db = db;
        this.media = media;
    }
    async query(stores, query) {
        if (stores.length === 0)
            return [];
        const byId = new Map(stores.map((s) => [s.id, s]));
        const conditions = [
            sql `p.status = 'active'`,
            sql `p.moderation_status in ('ok', 'review')`,
            sql `p.base_price_cents is not null`,
            sql `exists (select 1 from product_variants v where v.product_id = p.id and v.active and v.stock - v.reserved > 0)`,
        ];
        const text = query.q?.trim();
        const norm = text ? sql `f_norm(${text})` : null;
        if (norm && text) {
            const fuzzy = text.length >= 4 ? sql ` or word_similarity(${norm}, f_norm(p.name)) >= 0.5` : sql ``;
            conditions.push(sql `(f_norm(p.name) like '%' || f_norm(${likeEscape(text)}) || '%'${fuzzy})`);
        }
        if (query.categoryIds?.length)
            conditions.push(sql `p.category_id = any(${pgArray(query.categoryIds, 'uuid')})`);
        if (query.minPriceCents !== undefined)
            conditions.push(sql `${EFFECTIVE_PRICE} >= ${query.minPriceCents}`);
        if (query.maxPriceCents !== undefined)
            conditions.push(sql `${EFFECTIVE_PRICE} <= ${query.maxPriceCents}`);
        if (query.promoOnly)
            conditions.push(PROMO_ACTIVE);
        if (query.productIds)
            conditions.push(sql `p.id = any(${pgArray(query.productIds, 'uuid')})`);
        const score = norm && text ? sql `(case when f_norm(p.name) like f_norm(${likeEscape(text)}) || '%' then 3 when f_norm(p.name) like '%' || f_norm(${likeEscape(text)}) || '%' then 2 else 0 end + word_similarity(${norm}, f_norm(p.name)))` : sql `0::float8`;
        const discount = sql `(case when ${PROMO_ACTIVE} then (p.base_price_cents - p.promo_price_cents) * 100.0 / p.base_price_cents else 0 end)`;
        const orderBy = {
            relevance: sql `d.is_open desc, ${score} desc, d.distance_m asc, p.id asc`,
            price_asc: sql `${EFFECTIVE_PRICE} asc, d.distance_m asc, p.id asc`,
            distance: sql `d.distance_m asc, ${score} desc, p.id asc`,
            rating: sql `d.rating desc, d.distance_m asc, p.id asc`,
            discount: sql `${discount} desc, d.distance_m asc, p.id asc`,
        }[query.sort];
        const result = await this.db.execute(sql `
      select p.id, p.name, p.store_id, p.category_id, p.base_price_cents, p.promo_price_cents, p.promo_starts_at, p.promo_ends_at
        from products p
        join unnest(${pgArray(stores.map((s) => s.id), 'uuid')}, ${pgArray(stores.map((s) => s.distanceM), 'int')}, ${pgArray(stores.map((s) => s.ratingAverage ?? 0), 'float8')}, ${pgArray(stores.map((s) => s.open), 'boolean')})
          as d(store_id, distance_m, rating, is_open) on d.store_id = p.store_id
       where ${sql.join(conditions, sql ` and `)}
       order by ${orderBy}
       limit ${query.limit} offset ${query.offset}
    `);
        const rows = result.rows;
        const images = await this.covers(rows.map((row) => row.id));
        const now = new Date();
        return rows.map((row) => {
            const store = byId.get(row.store_id);
            const price = effectivePrice(row.base_price_cents, null, { promoPriceCents: row.promo_price_cents, promoStartsAt: row.promo_starts_at ? new Date(row.promo_starts_at) : null, promoEndsAt: row.promo_ends_at ? new Date(row.promo_ends_at) : null }, now);
            return {
                id: row.id,
                name: row.name,
                image: images.get(row.id) ?? null,
                priceCents: price.priceCents,
                originalPriceCents: price.originalCents,
                discountPercent: price.discountPct,
                categoryId: row.category_id,
                store: { id: store.id, name: store.name, open: store.open, opensAt: store.opensAt, distanceM: store.distanceM, etaMinMinutes: store.etaMinMinutes, etaMaxMinutes: store.etaMaxMinutes },
            };
        });
    }
    async covers(productIds) {
        const map = new Map();
        if (productIds.length === 0)
            return map;
        const rows = await this.db
            .select({ productId: productImages.productId, asset: mediaAssets })
            .from(productImages)
            .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.assetId))
            .where(and(inArray(productImages.productId, productIds), eq(productImages.position, 0)))
            .orderBy(asc(productImages.position));
        for (const row of rows)
            map.set(row.productId, this.media.publicVariants(row.asset));
        return map;
    }
};
ProductFeedService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, MediaService])
], ProductFeedService);
export { ProductFeedService };
//# sourceMappingURL=product-feed.service.js.map