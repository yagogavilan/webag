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
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, Public, RequireReauth } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { PaymentsService } from './payments.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value) => {
    if (!UUID.test(value))
        throw errors.notFound();
    return value;
};
/** DTO de saída explícito: dinheiro como Money em centavos; nada de ID do provedor ou dado interno. */
export function presentAttempt(attempt) {
    return {
        id: attempt.id,
        status: attempt.status,
        method: attempt.method,
        amount: { amount: attempt.amountCents, currency: attempt.currency },
        applicationFee: { amount: attempt.applicationFeeCents, currency: attempt.currency },
        installments: attempt.installments,
        pixCopyPaste: attempt.pixCopyPaste,
        expiresAt: attempt.expiresAt?.toISOString() ?? null,
        declineReason: attempt.declineReason,
        createdAt: attempt.createdAt.toISOString(),
    };
}
/**
 * Webhook do provedor. Público (quem chama é o provedor), mas só processa o que tiver assinatura válida (SEC-032).
 * Responde 2xx rápido; o trabalho vai para a fila durável. Nenhuma rota aqui muda estado a pedido de cliente (SEC-035).
 */
let WebhooksController = class WebhooksController {
    payments;
    constructor(payments) {
        this.payments = payments;
    }
    async receive(provider, req, query) {
        if (provider !== this.payments.provider.name)
            throw errors.notFound();
        const result = await this.payments.receiveWebhook({ headers: req.headers, query });
        return { received: true, duplicate: !result.queued };
    }
};
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'webhook', limit: 600, windowSeconds: 60 }),
    Post(':provider'),
    __param(0, Param('provider')),
    __param(1, Req()),
    __param(2, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "receive", null);
WebhooksController = __decorate([
    Controller('v1/webhooks'),
    __metadata("design:paramtypes", [PaymentsService])
], WebhooksController);
export { WebhooksController };
const refundQueueQuerySchema = z.strictObject({
    cursor: z.string().max(200).optional(),
    limit: z.string().max(4).optional(),
    status: z.enum(['pending', 'exhausted', 'covered']).optional(),
});
const coverRefundSchema = z.strictObject({ reason: z.string().min(10).max(300) });
const alertsQuerySchema = z.strictObject({
    cursor: z.string().max(200).optional(),
    limit: z.string().max(4).optional(),
    openOnly: z.enum(['true', 'false']).optional(),
});
let PaymentsAdminController = class PaymentsAdminController {
    payments;
    constructor(payments) {
        this.payments = payments;
    }
    async alerts(query) {
        const page = await this.payments.listAlerts({ ...query, openOnly: query.openOnly === 'true' });
        return {
            data: page.data.map((alert) => ({ ...alert, createdAt: alert.createdAt.toISOString(), resolvedAt: alert.resolvedAt?.toISOString() ?? null })),
            nextCursor: page.nextCursor,
        };
    }
    async refundQueue(query) {
        return this.payments.listRefundQueue(query);
    }
    async retryRefund(intentId, ctx) {
        return this.payments.retryRefundIntent(uuid(intentId), ctx);
    }
    async coverRefund(intentId, body, ctx) {
        await this.payments.coverRefundIntent(uuid(intentId), body.reason, ctx);
    }
    async reprocess(eventId, ctx) {
        const id = Number(eventId);
        if (!Number.isSafeInteger(id) || id < 1)
            throw errors.notFound();
        await this.payments.reprocess(id, ctx);
    }
};
__decorate([
    AdminOnly('payments:alerts:read'),
    Get('alerts'),
    __param(0, Query(new ZodPipe(alertsQuerySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsAdminController.prototype, "alerts", null);
__decorate([
    AdminOnly('payments:refunds:read'),
    Get('refund-queue'),
    __param(0, Query(new ZodPipe(refundQueueQuerySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsAdminController.prototype, "refundQueue", null);
__decorate([
    AdminOnly('payments:refunds:retry'),
    RequireReauth(),
    HttpCode(200),
    Post('refund-queue/:intentId/retry'),
    __param(0, Param('intentId')),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsAdminController.prototype, "retryRefund", null);
__decorate([
    AdminOnly('payments:refunds:cover'),
    RequireReauth(),
    HttpCode(204),
    Post('refund-queue/:intentId/cover'),
    __param(0, Param('intentId')),
    __param(1, Body(new ZodPipe(coverRefundSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentsAdminController.prototype, "coverRefund", null);
__decorate([
    AdminOnly('payments:webhooks:reprocess'),
    HttpCode(204),
    Post('webhook-events/:eventId/reprocess'),
    __param(0, Param('eventId')),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsAdminController.prototype, "reprocess", null);
PaymentsAdminController = __decorate([
    Controller('v1/admin/payments'),
    __metadata("design:paramtypes", [PaymentsService])
], PaymentsAdminController);
export { PaymentsAdminController };
const devCreateSchema = z.strictObject({
    amountCents: z.number().int().positive(),
    method: z.enum(['pix', 'card']),
    storeId: z.uuid().nullable().default(null),
    externalReference: z.string().min(1).max(80).default('dev-order'),
    applicationFeeCents: z.number().int().min(0).default(0),
    installments: z.number().int().min(1).max(12).optional(),
    cardToken: z.string().max(80).optional(),
});
const devSimulateSchema = z.strictObject({
    reportedAmountCents: z.number().int().optional(),
    reportedReference: z.string().max(80).optional(),
    reportedReceiverId: z.string().max(100).optional(),
    reportedFeeCents: z.number().int().optional(),
});
export { devCreateSchema, devSimulateSchema, uuid };
//# sourceMappingURL=payments.controllers.js.map