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
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
const shortName = (full) => {
    const parts = full.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts.at(-1).slice(0, 1).toUpperCase()}.` : (parts[0] ?? '');
};
/** WB-075 / avaliações no painel do lojista: lista e resposta pública da loja (uma por avaliação, editável, 500 caracteres). */
let StoreReviewsService = class StoreReviewsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(storeId, query) {
        const limit = parseLimit(query.limit);
        const cursor = decodeCursor(query.cursor);
        const rows = await this.db
            .select({ r: t.reviews, author: t.users.name, productName: t.products.name })
            .from(t.reviews)
            .innerJoin(t.users, eq(t.users.id, t.reviews.userId))
            .leftJoin(t.products, eq(t.products.id, t.reviews.productId))
            .where(and(eq(t.reviews.storeId, storeId), eq(t.reviews.status, 'published'), query.replied === undefined ? undefined : query.replied ? isNotNull(t.reviews.storeReply) : isNull(t.reviews.storeReply), query.rating ? eq(t.reviews.rating, query.rating) : undefined, cursor ? sql `(${t.reviews.createdAt}, ${t.reviews.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined))
            .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id))
            .limit(limit + 1);
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
            data: page.map(({ r, author, productName }) => ({ id: r.id, rating: r.rating, comment: r.comment, fit: r.fit, reviewer: shortName(author), target: r.productId ? { type: 'product', id: r.productId, name: productName } : { type: 'store', id: r.storeId, name: null }, createdAt: r.createdAt.toISOString(), storeReply: r.storeReply, storeRepliedAt: r.storeRepliedAt?.toISOString() ?? null })),
            nextCursor: rows.length > limit && last ? encodeCursor({ at: last.r.createdAt.toISOString(), id: last.r.id }) : null,
        };
    }
    async mine(storeId, reviewId) {
        const [review] = await this.db.select().from(t.reviews).where(and(eq(t.reviews.id, reviewId), eq(t.reviews.storeId, storeId), eq(t.reviews.status, 'published')));
        if (!review)
            throw errors.notFound('Avaliação não encontrada.');
        return review;
    }
    async reply(storeId, reviewId, userId, text) {
        const review = await this.mine(storeId, reviewId);
        const now = new Date();
        await this.db.transaction(async (tx) => {
            await tx.update(t.reviews).set({ storeReply: text, storeRepliedAt: now }).where(eq(t.reviews.id, review.id));
            await tx.insert(t.storeActivity).values({ storeId, actorId: userId, action: review.storeReply ? 'review.reply_edit' : 'review.reply', details: { reviewId } });
        });
        return { id: review.id, storeReply: text, storeRepliedAt: now.toISOString() };
    }
    async removeReply(storeId, reviewId, userId) {
        const review = await this.mine(storeId, reviewId);
        if (review.storeReply === null)
            return;
        await this.db.transaction(async (tx) => {
            await tx.update(t.reviews).set({ storeReply: null, storeRepliedAt: null }).where(eq(t.reviews.id, review.id));
            await tx.insert(t.storeActivity).values({ storeId, actorId: userId, action: 'review.reply_remove', details: { reviewId } });
        });
    }
};
StoreReviewsService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], StoreReviewsService);
export { StoreReviewsService };
//# sourceMappingURL=store-reviews.service.js.map