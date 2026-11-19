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
import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, Public } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { CardIntentService } from './card-intent.service.js';
import { LateDeliveryService } from './late-delivery.service.js';
import { OrdersService } from './orders.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderIdParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound('Pedido não encontrado.');
    return value;
};
const createSchema = z
    .strictObject({
    mode: z.enum(['delivery', 'pickup']),
    addressId: z.uuid().optional(),
    cartRevision: z.number().int().min(0),
    paymentMethod: z.enum(['pix', 'card']),
    /** SEC-147: obrigatório. O total que o cliente viu; se frete ou desconto mudaram, o pedido não sai sem ele ver o novo valor. */
    expectedTotalCents: z.number().int().min(0),
    card: z
        .strictObject({
        token: z.string().min(8).max(200),
        installments: z.number().int().min(1).max(3),
        paymentMethodId: z.string().max(40).optional(),
        issuerId: z.string().max(40).optional(),
    })
        .optional(),
    payerDocument: z.string().regex(/^\d{11}$/).optional(),
})
    .refine((v) => v.paymentMethod !== 'card' || v.card !== undefined, { message: 'Informe o cartão.', path: ['card'] })
    .refine((v) => v.paymentMethod !== 'pix' || v.card === undefined, { message: 'Cartão só com paymentMethod=card.', path: ['card'] });
const intentSchema = z.strictObject({
    mode: z.enum(['delivery', 'pickup']),
    addressId: z.uuid().optional(),
    cartRevision: z.number().int().min(0),
    expectedTotalCents: z.number().int().min(0),
    payerDocument: z.string().regex(/^\d{11}$/).optional(),
});
const intentPaySchema = z.strictObject({
    card: z.strictObject({ token: z.string().min(8).max(200), installments: z.number().int().min(1).max(3), paymentMethodId: z.string().max(40).optional(), issuerId: z.string().max(40).optional() }),
});
const listSchema = z.strictObject({ scope: z.enum(['active', 'past']).optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const cancelSchema = z.strictObject({ reason: z.string().trim().max(200).optional() });
/** Pedidos do cliente. Tudo filtra pelo `userId` do token: pedido de outra conta é 404 (SEC-020). */
let OrdersController = class OrdersController {
    orders;
    late;
    constructor(orders, late) {
        this.orders = orders;
        this.late = late;
    }
    /** Criar pedido é escrita cara e repetível em 3G: `Idempotency-Key` obrigatória e limite por IP. */
    async create(principal, body, idempotencyKey, res) {
        const key = parseIdempotencyKey(idempotencyKey, true);
        const { created, orderId } = await this.orders.create(principal, body, key);
        res.status(created ? 201 : 200);
        return this.orders.getForCustomer(principal.userId, orderId);
    }
    async list(principal, query) {
        return this.orders.listForCustomer(principal.userId, query);
    }
    get(principal, orderId) {
        return this.orders.getForCustomer(principal.userId, orderIdParam(orderId));
    }
    payment(principal, orderId) {
        return this.orders.paymentForCustomer(principal.userId, orderIdParam(orderId));
    }
    /** B.1 "Não recebi meu pedido": avisa a operação (alerta + auditoria). 409 `ORDER_NOT_REPORTABLE` fora da janela; repetir é idempotente. */
    reportNotReceived(principal, ctx, orderId) {
        return this.orders.reportNotReceived(principal, orderIdParam(orderId), ctx);
    }
    /** BUG-015 / WB-028 C2: com o pedido em separação o cliente pede o cancelamento e a loja decide. */
    requestCancel(principal, orderId, body) {
        return this.orders.requestCancel(principal.userId, orderIdParam(orderId), body.reason ?? null);
    }
    /**
     * WB-253 / RN-19 4d: "Cancelar sem custo" por atraso da entrega (depois do fim da faixa + tolerância). Antes da saída cancela na hora
     * com estorno total; em saída abre o pedido à operação (`delay.cancelRequest`). 409 `LATE_CANCEL_NOT_AVAILABLE` / `ORDER_ALREADY_DELIVERED`.
     */
    async cancelLate(principal, orderId) {
        const id = orderIdParam(orderId);
        await this.late.cancelLate(principal.userId, id);
        return this.orders.getForCustomer(principal.userId, id);
    }
    async cancel(principal, orderId, body) {
        const id = orderIdParam(orderId);
        await this.orders.cancelByCustomer(principal.userId, id, body.reason ?? null);
        return this.orders.getForCustomer(principal.userId, id);
    }
};
__decorate([
    RateLimit({ name: 'order-create', limit: 30, windowSeconds: 3600 }),
    Post(),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(createSchema))),
    __param(2, Headers('idempotency-key')),
    __param(3, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "create", null);
__decorate([
    Get(),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(listSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "list", null);
__decorate([
    Get(':orderId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "get", null);
__decorate([
    Get(':orderId/payment'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "payment", null);
__decorate([
    HttpCode(202),
    RateLimit({ name: 'order-not-received', limit: 10, windowSeconds: 3600 }),
    Post(':orderId/not-received'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "reportNotReceived", null);
__decorate([
    HttpCode(202),
    RateLimit({ name: 'order-cancel-request', limit: 20, windowSeconds: 3600 }),
    Post(':orderId/cancel-request'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __param(2, Body(new ZodPipe(cancelSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "requestCancel", null);
__decorate([
    HttpCode(200),
    RateLimit({ name: 'order-cancel-late', limit: 20, windowSeconds: 3600 }),
    Post(':orderId/cancel-late'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "cancelLate", null);
__decorate([
    HttpCode(200),
    RateLimit({ name: 'order-cancel', limit: 30, windowSeconds: 3600 }),
    Post(':orderId/cancel'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __param(2, Body(new ZodPipe(cancelSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "cancel", null);
OrdersController = __decorate([
    Controller('v1/orders'),
    __metadata("design:paramtypes", [OrdersService,
        LateDeliveryService])
], OrdersController);
export { OrdersController };
/** B.2: intenção de cartão para a página segura do Mercado Pago (o app nunca toca em dado de cartão). */
let CardIntentController = class CardIntentController {
    intents;
    constructor(intents) {
        this.intents = intents;
    }
    /** O app pede a intenção (o que vai comprar e o total que viu) e abre `url` no navegador do sistema. Uso único, 15 min. */
    create(principal, body) {
        return this.intents.create(principal, body);
    }
    /** Página segura (sem login: a credencial é o token): valor e provedor para montar o formulário do MP. */
    view(token) {
        return this.intents.view(token);
    }
    /** Página segura: manda o token do cartão (gerado no navegador pelo MP.js). Consome a intenção e cria o pedido. */
    pay(token, body) {
        return this.intents.complete(token, body.card);
    }
};
__decorate([
    RateLimit({ name: 'card-intent-create', limit: 20, windowSeconds: 3600 }),
    Post('card-intents'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(intentSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CardIntentController.prototype, "create", null);
__decorate([
    Public(),
    RateLimit({ name: 'card-intent-view', limit: 60, windowSeconds: 3600 }),
    Get('card-intents/:token'),
    __param(0, Param('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CardIntentController.prototype, "view", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'card-intent-pay', limit: 20, windowSeconds: 3600 }),
    Post('card-intents/:token/pay'),
    __param(0, Param('token')),
    __param(1, Body(new ZodPipe(intentPaySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CardIntentController.prototype, "pay", null);
CardIntentController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [CardIntentService])
], CardIntentController);
export { CardIntentController };
//# sourceMappingURL=orders.controller.js.map