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
import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, RequireReauth } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { LateDeliveryService } from './late-delivery.service.js';
import { OrdersService } from './orders.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const refundSchema = z.strictObject({
    amountCents: z.number().int().positive().max(100_000_000),
    reason: z.string().trim().min(10).max(300),
});
const cancelSchema = z.strictObject({ reason: z.string().trim().min(10).max(300), refund: z.boolean().default(true) });
const lateRespondSchema = z.strictObject({ action: z.enum(['accept', 'arrive_soon']), note: z.string().trim().max(200).optional() });
const returnSchema = z.strictObject({ reason: z.string().trim().min(10).max(300) });
/** Ações do admin sobre pedidos (SEC-039). A lista/detalhe de pedidos do admin entra com o painel (Onda 4D). */
let AdminOrdersController = class AdminOrdersController {
    orders;
    late;
    constructor(orders, late) {
        this.orders = orders;
        this.late = late;
    }
    /** Estorno manual total ou parcial: reautenticação, motivo, `Idempotency-Key` obrigatória e auditoria. */
    async refund(orderId, idempotencyKey, body, ctx) {
        if (!UUID.test(orderId))
            throw errors.notFound();
        const key = parseIdempotencyKey(idempotencyKey, true);
        const result = await this.orders.adminRefund(orderId, { amountCents: body.amountCents, reason: body.reason, idempotencyKey: key }, ctx);
        return {
            status: result.status,
            refunded: { amount: result.refundedCents, currency: 'BRL' },
            remaining: { amount: result.remainingCents, currency: 'BRL' },
        };
    }
    /** BUG-011 / RN-08: cancelamento pelo admin (motivo obrigatório, auditado), com estorno do saldo por padrão; a loja e a logística param de tratar o pedido. */
    async cancel(orderId, body, ctx) {
        if (!UUID.test(orderId))
            throw errors.notFound();
        const result = await this.orders.adminCancel(orderId, { reason: body.reason, refund: body.refund }, ctx);
        return {
            status: result.status,
            refunded: { amount: result.refundedCents, currency: 'BRL' },
            remaining: { amount: result.remainingCents, currency: 'BRL' },
        };
    }
    /** SEC-143: o admin registra que a loja recebeu a devolução (a loja não confirmou no painel); motivo obrigatório, auditado, outra pessoa que a operação que declarou a devolução. */
    async storeReturn(orderId, body, ctx) {
        if (!UUID.test(orderId))
            throw errors.notFound();
        await this.orders.adminConfirmStoreReturn(orderId, body.reason, ctx);
        return { status: 'cancelled' };
    }
    /** WB-255 C6 / RN-19 4d: a operação responde ao cancelamento por atraso com o pedido em saída (aceita ou "chego em até N min"). Sem resposta em `entrega_cancel_resposta_min`, o sistema aceita. */
    async respondLateCancel(orderId, body, ctx) {
        if (!UUID.test(orderId))
            throw errors.notFound();
        return this.late.respond(orderId, body, ctx);
    }
};
__decorate([
    AdminOnly('orders:refund'),
    RequireReauth(),
    HttpCode(200),
    RateLimit({ name: 'admin-refund', limit: 60, windowSeconds: 3600 }),
    Post(':orderId/refunds'),
    __param(0, Param('orderId')),
    __param(1, Headers('idempotency-key')),
    __param(2, Body(new ZodPipe(refundSchema))),
    __param(3, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminOrdersController.prototype, "refund", null);
__decorate([
    AdminOnly('orders:refund'),
    RequireReauth(),
    HttpCode(200),
    RateLimit({ name: 'admin-order-cancel', limit: 60, windowSeconds: 3600 }),
    Post(':orderId/cancel'),
    __param(0, Param('orderId')),
    __param(1, Body(new ZodPipe(cancelSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminOrdersController.prototype, "cancel", null);
__decorate([
    AdminOnly('logistics:write'),
    RequireReauth(),
    HttpCode(200),
    RateLimit({ name: 'admin-store-return', limit: 60, windowSeconds: 3600 }),
    Post(':orderId/store-return'),
    __param(0, Param('orderId')),
    __param(1, Body(new ZodPipe(returnSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminOrdersController.prototype, "storeReturn", null);
__decorate([
    AdminOnly('logistics:write'),
    HttpCode(200),
    RateLimit({ name: 'admin-late-cancel-respond', limit: 120, windowSeconds: 3600 }),
    Post(':orderId/late-cancel/respond'),
    __param(0, Param('orderId')),
    __param(1, Body(new ZodPipe(lateRespondSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminOrdersController.prototype, "respondLateCancel", null);
AdminOrdersController = __decorate([
    Controller('v1/admin/orders'),
    __metadata("design:paramtypes", [OrdersService,
        LateDeliveryService])
], AdminOrdersController);
export { AdminOrdersController };
//# sourceMappingURL=admin-orders.controller.js.map