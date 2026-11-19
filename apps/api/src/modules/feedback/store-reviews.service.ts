import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';

const shortName = (full: string): string => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)!.slice(0, 1).toUpperCase()}.` : (parts[0] ?? '');
};

/** WB-075 / avaliações no painel do lojista: lista e resposta pública da loja (uma por avaliação, editável, 500 caracteres). */
@Injectable()
export class StoreReviewsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async list(storeId: string, query: { replied?: boolean | undefined; rating?: number | undefined; cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const rows = await this.db
      .select({ r: t.reviews, author: t.users.name, productName: t.products.name })
      .from(t.reviews)
      .innerJoin(t.users, eq(t.users.id, t.reviews.userId))
      .leftJoin(t.products, eq(t.products.id, t.reviews.productId))
      .where(and(eq(t.reviews.storeId, storeId), eq(t.reviews.status, 'published'), query.replied === undefined ? undefined : query.replied ? isNotNull(t.reviews.storeReply) : isNull(t.reviews.storeReply), query.rating ? eq(t.reviews.rating, query.rating) : undefined, cursor ? sql`(${t.reviews.createdAt}, ${t.reviews.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined))
      .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      data: page.map(({ r, author, productName }) => ({ id: r.id, rating: r.rating, comment: r.comment, fit: r.fit, reviewer: shortName(author), target: r.productId ? { type: 'product' as const, id: r.productId, name: productName } : { type: 'store' as const, id: r.storeId, name: null }, createdAt: r.createdAt.toISOString(), storeReply: r.storeReply, storeRepliedAt: r.storeRepliedAt?.toISOString() ?? null })),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: last.r.createdAt.toISOString(), id: last.r.id }) : null,
    };
  }

  private async mine(storeId: string, reviewId: string) {
    const [review] = await this.db.select().from(t.reviews).where(and(eq(t.reviews.id, reviewId), eq(t.reviews.storeId, storeId), eq(t.reviews.status, 'published')));
    if (!review) throw errors.notFound('Avaliação não encontrada.');
    return review;
  }

  async reply(storeId: string, reviewId: string, userId: string, text: string) {
    const review = await this.mine(storeId, reviewId);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.update(t.reviews).set({ storeReply: text, storeRepliedAt: now }).where(eq(t.reviews.id, review.id));
      await tx.insert(t.storeActivity).values({ storeId, actorId: userId, action: review.storeReply ? 'review.reply_edit' : 'review.reply', details: { reviewId } });
    });
    return { id: review.id, storeReply: text, storeRepliedAt: now.toISOString() };
  }

  async removeReply(storeId: string, reviewId: string, userId: string): Promise<void> {
    const review = await this.mine(storeId, reviewId);
    if (review.storeReply === null) return;
    await this.db.transaction(async (tx) => {
      await tx.update(t.reviews).set({ storeReply: null, storeRepliedAt: null }).where(eq(t.reviews.id, review.id));
      await tx.insert(t.storeActivity).values({ storeId, actorId: userId, action: 'review.reply_remove', details: { reviewId } });
    });
  }
}
