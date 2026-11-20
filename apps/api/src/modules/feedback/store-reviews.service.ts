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

  /**
   * W.6: resumo para o Início e a página de Avaliações do lojista: média (1 casa), total, distribuição de 1 a 5 e quantas ainda estão sem resposta.
   * Mesmo universo da lista (avaliações publicadas da loja, de produto e da loja). Sem o mínimo de exibição: é o painel do dono, não a vitrine.
   */
  async summary(storeId: string) {
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        avg: sql<number | null>`avg(${t.reviews.rating})::float8`,
        r1: sql<number>`count(*) filter (where ${t.reviews.rating} = 1)::int`,
        r2: sql<number>`count(*) filter (where ${t.reviews.rating} = 2)::int`,
        r3: sql<number>`count(*) filter (where ${t.reviews.rating} = 3)::int`,
        r4: sql<number>`count(*) filter (where ${t.reviews.rating} = 4)::int`,
        r5: sql<number>`count(*) filter (where ${t.reviews.rating} = 5)::int`,
        unreplied: sql<number>`count(*) filter (where ${t.reviews.storeReply} is null)::int`,
      })
      .from(t.reviews)
      .where(and(eq(t.reviews.storeId, storeId), eq(t.reviews.status, 'published')));
    const total = row?.total ?? 0;
    return {
      average: total === 0 || row?.avg == null ? null : Math.round(row.avg * 10) / 10,
      total,
      distribution: { '1': row?.r1 ?? 0, '2': row?.r2 ?? 0, '3': row?.r3 ?? 0, '4': row?.r4 ?? 0, '5': row?.r5 ?? 0 },
      withoutReply: row?.unreplied ?? 0,
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
