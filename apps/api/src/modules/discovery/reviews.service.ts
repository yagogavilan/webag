import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ParametersService } from '../admin/index.js';
import { users } from '../identity/db/schema.js';
import { orderItems, orders } from '../orders/db/schema.js';
import { shortName } from './browse.service.js';
import { reviews } from './db/schema.js';

export interface CreateReviewInput {
  /** Produto do pedido; ausente = avaliação da loja. */
  productId?: string | undefined;
  rating: number;
  comment?: string | undefined;
  /** "Como vestiu?" (WB-247): só em avaliação de produto. */
  fit?: 'small' | 'ok' | 'large' | undefined;
}

type ReviewRow = typeof reviews.$inferSelect;

/** Avaliações do cliente (RN-12): só de pedido ENTREGUE, dentro de `avaliacao_janela_dias`, uma por produto e uma da loja por pedido, sem edição. */
@Injectable()
export class ReviewsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
  ) {}

  private present(review: ReviewRow, name: string) {
    return {
      id: review.id,
      productId: review.productId,
      rating: review.rating,
      comment: review.comment,
      fit: review.fit,
      reviewer: shortName(name),
      verifiedPurchase: review.orderId !== null,
      createdAt: review.createdAt.toISOString(),
      storeReply: review.storeReply,
      storeRepliedAt: review.storeRepliedAt?.toISOString() ?? null,
    };
  }

  async create(userId: string, orderId: string, input: CreateReviewInput) {
    const [order] = await this.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    if (!order) throw errors.notFound('Pedido não encontrado.');
    if (order.status !== 'delivered' || !order.deliveredAt) throw errors.conflict('ORDER_NOT_DELIVERED', 'Só dá para avaliar depois da entrega');
    const windowDays = await this.params.getNumber('avaliacao_janela_dias');
    if (Date.now() > order.deliveredAt.getTime() + windowDays * 86_400_000) throw errors.unprocessable('REVIEW_WINDOW_CLOSED', 'O prazo para avaliar acabou', { detail: `Você pode avaliar até ${windowDays} dias depois da entrega.` });
    if (input.productId) {
      const [item] = await this.db.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.productId, input.productId)));
      if (!item) throw errors.notFound('Produto não encontrado neste pedido.');
    } else if (input.fit) {
      throw errors.validation([{ field: 'fit', message: '"Como vestiu?" só vale para avaliação de produto.' }]);
    }
    const [created] = await this.db
      .insert(reviews)
      .values({ storeId: order.storeId, productId: input.productId ?? null, userId, orderId: order.id, rating: input.rating, comment: input.comment?.trim() || null, fit: input.productId ? (input.fit ?? null) : null })
      .onConflictDoNothing()
      .returning();
    if (!created) throw errors.conflict('REVIEW_ALREADY_EXISTS', 'Você já avaliou', 'A avaliação não pode ser editada nem repetida.');
    const [user] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    return this.present(created, user?.name ?? '');
  }

  async listForOrder(userId: string, orderId: string) {
    const [order] = await this.db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    if (!order) throw errors.notFound('Pedido não encontrado.');
    const [user] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const rows = await this.db.select().from(reviews).where(and(eq(reviews.orderId, orderId), eq(reviews.userId, userId))).orderBy(reviews.createdAt);
    return { data: rows.map((r) => this.present(r, user?.name ?? '')) };
  }
}
