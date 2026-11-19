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
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, Ctx, StorePermission } from '../../platform/auth/decorators.js';
import { memberHasStorePermission } from '../../platform/auth/permissions.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { PrincipalService } from '../identity/index.js';
import { uuidParam } from '../stores/index.js';
import { StoreOrdersService } from './store-orders.service.js';
const listSchema = z.strictObject({
    scope: z.enum(['new', 'in_progress', 'history']).optional(),
    number: z.string().trim().regex(/^WB-[A-Za-z0-9]{5}$/).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.string().max(4).optional(),
});
const reasonSchema = z.strictObject({ reason: z.string().trim().min(3).max(200) });
const statusSchema = z.strictObject({
    // DEC-036: na entrega Webag a loja só chega a `ready_for_collection`; saída e entrega são da logística.
    status: z.enum(['in_preparation', 'ready_for_collection', 'ready_for_pickup', 'delivered']),
    pickupCode: z.string().regex(/^\d{4,6}$/).optional(),
    /** Só em `ready_for_collection` (WB-229 C2). */
    volumes: z.number().int().min(1).max(99).optional(),
    note: z.string().trim().max(100).optional(),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderIdParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound('Pedido não encontrado.');
    return value;
};
const WRITE = { name: 'store-order-write', limit: 600, windowSeconds: 3600 };
/**
 * Painel de pedidos da loja (WB-067 a WB-072). Exige a permissão `orders` (dono ou funcionário com ela); não-membro
 * recebe 404. Valores (preços, comissão) só com `sales_values` (RN-13).
 */
let StoreOrdersController = class StoreOrdersController {
    orders;
    principals;
    constructor(orders, principals) {
        this.orders = orders;
        this.principals = principals;
    }
    async showValues(userId, storeId) {
        const member = await this.principals.storeMembership(userId, storeId);
        return member !== null && memberHasStorePermission(member, 'sales_values');
    }
    async list(p, storeId, query) {
        const id = uuidParam(storeId);
        return this.orders.list(id, { ...query, number: query.number }, await this.showValues(p.userId, id));
    }
    counts(storeId) {
        return this.orders.counts(uuidParam(storeId));
    }
    async get(p, storeId, orderId) {
        const id = uuidParam(storeId);
        return this.orders.get(id, orderIdParam(orderId), await this.showValues(p.userId, id));
    }
    ticket(storeId, orderId) {
        return this.orders.ticket(uuidParam(storeId), orderIdParam(orderId));
    }
    async accept(p, storeId, orderId) {
        const id = uuidParam(storeId);
        await this.orders.accept(id, orderIdParam(orderId), p.userId);
        return this.orders.get(id, orderId, await this.showValues(p.userId, id));
    }
    async refuse(p, storeId, orderId, body) {
        const id = uuidParam(storeId);
        await this.orders.refuse(id, orderIdParam(orderId), p.userId, body.reason);
        return this.orders.get(id, orderId, await this.showValues(p.userId, id));
    }
    async status(p, storeId, orderId, body) {
        const id = uuidParam(storeId);
        await this.orders.advance(id, orderIdParam(orderId), p.userId, body.status, body.pickupCode, { volumes: body.volumes, note: body.note });
        return this.orders.get(id, orderId, await this.showValues(p.userId, id));
    }
    /** SEC-143: a loja confirma que recebeu de volta a mercadoria da entrega não realizada; só então o pedido é cancelado e estornado. */
    async returnReceived(p, storeId, orderId, ctx) {
        const id = uuidParam(storeId);
        await this.orders.confirmReturnReceived(id, orderIdParam(orderId), p.userId, ctx);
        return this.orders.get(id, orderId, await this.showValues(p.userId, id));
    }
    /** BUG-015: a loja aprova o pedido de cancelamento do cliente (cancela e estorna) ou recusa com motivo. */
    async acceptCancelRequest(p, storeId, orderId) {
        const id = uuidParam(storeId);
        await this.orders.decideCancelRequest(id, orderIdParam(orderId), p.userId, 'approved', null);
        return this.orders.get(id, orderId, await this.showValues(p.userId, id));
    }
    async rejectCancelRequest(p, storeId, orderId, body) {
        const id = uuidParam(storeId);
        await this.orders.decideCancelRequest(id, orderIdParam(orderId), p.userId, 'refused', body.reason);
        return this.orders.get(id, orderId, await this.showValues(p.userId, id));
    }
    async cancel(p, storeId, orderId, body) {
        const id = uuidParam(storeId);
        await this.orders.cancel(id, orderIdParam(orderId), p.userId, body.reason);
        return this.orders.get(id, orderId, await this.showValues(p.userId, id));
    }
};
__decorate([
    StorePermission('orders'),
    Get(),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Query(new ZodPipe(listSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "list", null);
__decorate([
    StorePermission('orders'),
    Get('counts'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StoreOrdersController.prototype, "counts", null);
__decorate([
    StorePermission('orders'),
    Get(':orderId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "get", null);
__decorate([
    StorePermission('orders'),
    Get(':orderId/ticket'),
    __param(0, Param('storeId')),
    __param(1, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], StoreOrdersController.prototype, "ticket", null);
__decorate([
    StorePermission('orders'),
    HttpCode(200),
    RateLimit(WRITE),
    Post(':orderId/accept'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "accept", null);
__decorate([
    StorePermission('orders'),
    HttpCode(200),
    RateLimit(WRITE),
    Post(':orderId/refuse'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('orderId')),
    __param(3, Body(new ZodPipe(reasonSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "refuse", null);
__decorate([
    StorePermission('orders'),
    HttpCode(200),
    RateLimit(WRITE),
    Post(':orderId/status'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('orderId')),
    __param(3, Body(new ZodPipe(statusSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "status", null);
__decorate([
    StorePermission('orders'),
    HttpCode(200),
    RateLimit(WRITE),
    Post(':orderId/return-received'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('orderId')),
    __param(3, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "returnReceived", null);
__decorate([
    StorePermission('orders'),
    HttpCode(200),
    RateLimit(WRITE),
    Post(':orderId/cancel-request/accept'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "acceptCancelRequest", null);
__decorate([
    StorePermission('orders'),
    HttpCode(200),
    RateLimit(WRITE),
    Post(':orderId/cancel-request/reject'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('orderId')),
    __param(3, Body(new ZodPipe(reasonSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "rejectCancelRequest", null);
__decorate([
    StorePermission('orders'),
    HttpCode(200),
    RateLimit(WRITE),
    Post(':orderId/cancel'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('orderId')),
    __param(3, Body(new ZodPipe(reasonSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StoreOrdersController.prototype, "cancel", null);
StoreOrdersController = __decorate([
    Controller('v1/stores/:storeId/orders'),
    __metadata("design:paramtypes", [StoreOrdersService,
        PrincipalService])
], StoreOrdersController);
export { StoreOrdersController };
//# sourceMappingURL=store-orders.controller.js.map