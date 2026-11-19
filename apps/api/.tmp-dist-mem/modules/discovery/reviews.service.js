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
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ParametersService } from '../admin/index.js';
import { users } from '../identity/db/schema.js';
import { orderItems, orders } from '../orders/db/schema.js';
import { shortName } from './browse.service.js';
import { reviews } from './db/schema.js';
/** Avaliações do cliente (RN-12): só de pedido ENTREGUE, dentro de `avaliacao_janela_dias`, uma por produto e uma da loja por pedido, sem edição. */
let ReviewsService = class ReviewsService {
    db;
    params;
    constructor(db, params) {
        this.db = db;
        this.params = params;
    }
    present(review, name) {
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
    async create(userId, orderId, input) {
        const [order] = await this.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
        if (!order)
            throw errors.notFound('Pedido não encontrado.');
        if (order.status !== 'delivered' || !order.deliveredAt)
            throw errors.conflict('ORDER_NOT_DELIVERED', 'Só dá para avaliar depois da entrega');
        const windowDays = await this.params.getNumber('avaliacao_janela_dias');
        if (Date.now() > order.deliveredAt.getTime() + windowDays * 86_400_000)
            throw errors.unprocessable('REVIEW_WINDOW_CLOSED', 'O prazo para avaliar acabou', { detail: `Você pode avaliar até ${windowDays} dias depois da entrega.` });
        if (input.productId) {
            const [item] = await this.db.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.productId, input.productId)));
            if (!item)
                throw errors.notFound('Produto não encontrado neste pedido.');
        }
        else if (input.fit) {
            throw errors.validation([{ field: 'fit', message: '"Como vestiu?" só vale para avaliação de produto.' }]);
        }
        const [created] = await this.db
            .insert(reviews)
            .values({ storeId: order.storeId, productId: input.productId ?? null, userId, orderId: order.id, rating: input.rating, comment: input.comment?.trim() || null, fit: input.productId ? (input.fit ?? null) : null })
            .onConflictDoNothing()
            .returning();
        if (!created)
            throw errors.conflict('REVIEW_ALREADY_EXISTS', 'Você já avaliou', 'A avaliação não pode ser editada nem repetida.');
        const [user] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId));
        return this.present(created, user?.name ?? '');
    }
    async listForOrder(userId, orderId) {
        const [order] = await this.db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
        if (!order)
            throw errors.notFound('Pedido não encontrado.');
        const [user] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId));
        const rows = await this.db.select().from(reviews).where(and(eq(reviews.orderId, orderId), eq(reviews.userId, userId))).orderBy(reviews.createdAt);
        return { data: rows.map((r) => this.present(r, user?.name ?? '')) };
    }
};
ReviewsService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, ParametersService])
], ReviewsService);
export { ReviewsService };
//# sourceMappingURL=reviews.service.js.map