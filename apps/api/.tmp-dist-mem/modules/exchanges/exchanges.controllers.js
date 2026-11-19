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
import { AdminOnly, Ctx, CurrentPrincipal, StorePermission } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { uuidParam } from '../stores/index.js';
import { EXCHANGE_STATUSES } from './db/schema.js';
import { EXCHANGE_TYPES } from './domain/eligibility.js';
import { AuditService } from '../admin/index.js';
import { ExchangesReportService } from './exchanges-report.service.js';
import { ExchangesService } from './exchanges.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound('Recurso não encontrado.');
    return value;
};
const createSchema = z.strictObject({
    orderItemId: z.uuid(),
    type: z.enum(EXCHANGE_TYPES),
    reasonCode: z.enum(['size', 'color']).optional(),
    description: z.string().trim().max(500).optional(),
    method: z.enum(['pickup_at_home', 'drop_at_store']),
    resolution: z.enum(['replace', 'refund']).optional(),
    newVariantId: z.uuid().optional(),
    photoIds: z.array(z.uuid()).max(5).optional(),
});
const listSchema = z.strictObject({ cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const storeListSchema = listSchema.extend({ scope: z.enum(['pending', 'in_progress', 'history']).optional() });
const cancelSchema = z.strictObject({ reason: z.string().trim().max(200).optional() });
const paySchema = z
    .strictObject({
    paymentMethod: z.enum(['pix', 'card']),
    card: z.strictObject({ token: z.string().min(8).max(200), installments: z.number().int().min(1).max(3), paymentMethodId: z.string().max(40).optional(), issuerId: z.string().max(40).optional() }).optional(),
    payerDocument: z.string().regex(/^\d{11}$/).optional(),
})
    .refine((v) => v.paymentMethod !== 'card' || v.card !== undefined, { message: 'Informe o cartão.', path: ['card'] })
    .refine((v) => v.paymentMethod !== 'pix' || v.card === undefined, { message: 'Cartão só com paymentMethod=card.', path: ['card'] });
const contestSchema = z.strictObject({ text: z.string().trim().min(10).max(500) });
const mediationQuery = z.strictObject({ cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const mediationDecision = z.strictObject({ decision: z.enum(['customer', 'store']), reason: z.string().trim().min(10).max(200) });
const rejectSchema = z.strictObject({ reason: z.string().trim().min(3).max(200) });
const receiveSchema = z.strictObject({
    ok: z.boolean(),
    reason: z.string().trim().min(3).max(200).optional(),
    returnToStock: z.boolean().optional(),
    /** Troca na loja: código de 6 caracteres que o cliente mostra no balcão. */
    code: z.string().trim().min(6).max(6).optional(),
});
/** Trocas do cliente (T.2). Tudo filtra pelo `userId` do token: troca ou pedido de outra conta é 404. */
let ExchangesController = class ExchangesController {
    exchanges;
    constructor(exchanges) {
        this.exchanges = exchanges;
    }
    options(p, orderId) {
        return this.exchanges.options(p.userId, idParam(orderId));
    }
    /** Escrita repetível em 3G: `Idempotency-Key` obrigatória. */
    async create(p, orderId, body, key, res) {
        const { created, exchange } = await this.exchanges.create(p, idParam(orderId), body, parseIdempotencyKey(key, true));
        res.status(created ? 201 : 200);
        return exchange;
    }
    list(p, query) {
        return this.exchanges.listForCustomer(p.userId, query);
    }
    get(p, id) {
        return this.exchanges.getForCustomer(p.userId, idParam(id));
    }
    async cancel(p, id, body) {
        await this.exchanges.cancelByCustomer(p.userId, idParam(id), body.reason ?? null);
        return this.exchanges.getForCustomer(p.userId, id);
    }
    /** WB-176: contestar a recusa da loja (uma vez, até `contestacao_dias`); a troca vai à mediação. Repetir é idempotente. */
    async contest(p, id, body) {
        await this.exchanges.contest(p.userId, idParam(id), body.text);
        return this.exchanges.getForCustomer(p.userId, id);
    }
    /** B.1: depois de aprovada, trocar a coleta em casa por levar o item à loja (só com a taxa ainda não paga e antes do motoboy sair). */
    async dropAtStore(principal, id) {
        await this.exchanges.switchToStore(principal.userId, idParam(id));
        return this.exchanges.getForCustomer(principal.userId, idParam(id));
    }
    payment(p, id) {
        return this.exchanges.paymentForCustomer(p.userId, idParam(id));
    }
    pay(p, id, idempotencyKey, body) {
        return this.exchanges.pay(p, idParam(id), body, parseIdempotencyKey(idempotencyKey));
    }
};
__decorate([
    Get('orders/:orderId/exchange-options'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ExchangesController.prototype, "options", null);
__decorate([
    RateLimit({ name: 'exchange-create', limit: 20, windowSeconds: 3600 }),
    Post('orders/:orderId/exchanges'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __param(2, Body(new ZodPipe(createSchema))),
    __param(3, Headers('idempotency-key')),
    __param(4, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ExchangesController.prototype, "create", null);
__decorate([
    Get('exchanges'),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(listSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ExchangesController.prototype, "list", null);
__decorate([
    Get('exchanges/:id'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ExchangesController.prototype, "get", null);
__decorate([
    HttpCode(200),
    RateLimit({ name: 'exchange-write', limit: 60, windowSeconds: 3600 }),
    Post('exchanges/:id/cancel'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(cancelSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ExchangesController.prototype, "cancel", null);
__decorate([
    HttpCode(200),
    RateLimit({ name: 'exchange-contest', limit: 10, windowSeconds: 3600 }),
    Post('exchanges/:id/contest'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(contestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ExchangesController.prototype, "contest", null);
__decorate([
    Post('exchanges/:id/drop-at-store'),
    HttpCode(200),
    RateLimit({ name: 'exchange-switch', limit: 30, windowSeconds: 3600 }),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ExchangesController.prototype, "dropAtStore", null);
__decorate([
    Get('exchanges/:id/payment'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ExchangesController.prototype, "payment", null);
__decorate([
    HttpCode(200),
    RateLimit({ name: 'exchange-pay', limit: 20, windowSeconds: 3600 }),
    Post('exchanges/:id/payment'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __param(2, Headers('idempotency-key')),
    __param(3, Body(new ZodPipe(paySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], ExchangesController.prototype, "pay", null);
ExchangesController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [ExchangesService])
], ExchangesController);
export { ExchangesController };
/** Fila de trocas da loja (WB-172/173). Exige a permissão `exchanges`; troca de outra loja é 404 (IDOR). */
let StoreExchangesController = class StoreExchangesController {
    exchanges;
    constructor(exchanges) {
        this.exchanges = exchanges;
    }
    list(storeId, query) {
        return this.exchanges.listForStore(uuidParam(storeId), query);
    }
    get(storeId, id) {
        return this.exchanges.getForStore(uuidParam(storeId), idParam(id));
    }
    async approve(p, storeId, id) {
        await this.exchanges.approve(uuidParam(storeId), idParam(id), p.userId);
        return this.exchanges.getForStore(storeId, id);
    }
    async reject(p, storeId, id, body) {
        await this.exchanges.reject(uuidParam(storeId), idParam(id), p.userId, body.reason);
        return this.exchanges.getForStore(storeId, id);
    }
    async receive(p, storeId, id, body) {
        await this.exchanges.receive(uuidParam(storeId), idParam(id), p.userId, body);
        return this.exchanges.getForStore(storeId, id);
    }
};
__decorate([
    StorePermission('exchanges'),
    Get(),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(storeListSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], StoreExchangesController.prototype, "list", null);
__decorate([
    StorePermission('exchanges'),
    Get(':id'),
    __param(0, Param('storeId')),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], StoreExchangesController.prototype, "get", null);
__decorate([
    StorePermission('exchanges'),
    HttpCode(200),
    RateLimit({ name: 'store-exchange-write', limit: 600, windowSeconds: 3600 }),
    Post(':id/accept'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], StoreExchangesController.prototype, "approve", null);
__decorate([
    StorePermission('exchanges'),
    HttpCode(200),
    RateLimit({ name: 'store-exchange-write', limit: 600, windowSeconds: 3600 }),
    Post(':id/refuse'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('id')),
    __param(3, Body(new ZodPipe(rejectSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StoreExchangesController.prototype, "reject", null);
__decorate([
    StorePermission('exchanges'),
    HttpCode(200),
    RateLimit({ name: 'store-exchange-write', limit: 600, windowSeconds: 3600 }),
    Post(':id/receive'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('id')),
    __param(3, Body(new ZodPipe(receiveSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StoreExchangesController.prototype, "receive", null);
StoreExchangesController = __decorate([
    Controller('v1/stores/:storeId/exchanges'),
    __metadata("design:paramtypes", [ExchangesService])
], StoreExchangesController);
export { StoreExchangesController };
const reportSchema = z
    .strictObject({
    from: z.iso.date(),
    to: z.iso.date(),
    storeId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    type: z.enum(EXCHANGE_TYPES).optional(),
    format: z.enum(['json', 'csv']).optional(),
})
    .refine((v) => v.from <= v.to, { message: 'O início do período não pode ser depois do fim.', path: ['from'] })
    .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366, { message: 'Período de no máximo 366 dias.', path: ['to'] });
/** WB-248: relatório de trocas por loja e categoria. Operação, financeiro e super admin; custos só financeiro e super admin. */
let ExchangesAdminController = class ExchangesAdminController {
    report;
    audit;
    constructor(report, audit) {
        this.report = report;
        this.audit = audit;
    }
    async get(query, ctx, res) {
        const profile = ctx.principal?.adminProfile;
        const result = await this.report.report(query, profile === 'super_admin' || profile === 'finance');
        if (query.format === 'csv') {
            // Exportação é auditada (WB-248 C4).
            await this.audit.recordStandalone(ctx, { action: 'exchange.report.export', targetType: 'report', targetId: 'exchanges', after: { from: query.from, to: query.to, storeId: query.storeId ?? null } });
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="trocas-${query.from}-${query.to}.csv"`);
            return this.report.toCsv(result);
        }
        return result;
    }
};
__decorate([
    AdminOnly('exchanges:report'),
    Get('report'),
    __param(0, Query(new ZodPipe(reportSchema))),
    __param(1, Ctx()),
    __param(2, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ExchangesAdminController.prototype, "get", null);
ExchangesAdminController = __decorate([
    Controller('v1/admin/exchanges'),
    __metadata("design:paramtypes", [ExchangesReportService,
        AuditService])
], ExchangesAdminController);
export { ExchangesAdminController };
/** Mediação de trocas (WB-110): fila por prazo e decisão com justificativa. Operação e super admin. */
let ExchangeMediationAdminController = class ExchangeMediationAdminController {
    exchanges;
    constructor(exchanges) {
        this.exchanges = exchanges;
    }
    list(query) {
        return this.exchanges.mediationQueue(query);
    }
    /** `customer` aprova a troca (segue o fluxo, inclusive a taxa); `store` recusa em definitivo. Justificativa obrigatória; as partes são avisadas. */
    async decide(exchangeId, body, ctx) {
        await this.exchanges.decideMediation(idParam(exchangeId), body.decision, body.reason, ctx);
        return { status: 'decided' };
    }
};
__decorate([
    AdminOnly('exchanges:mediate'),
    Get(),
    __param(0, Query(new ZodPipe(mediationQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ExchangeMediationAdminController.prototype, "list", null);
__decorate([
    AdminOnly('exchanges:mediate'),
    HttpCode(200),
    RateLimit({ name: 'admin-exchange-mediation', limit: 120, windowSeconds: 3600 }),
    Post(':exchangeId/decision'),
    __param(0, Param('exchangeId')),
    __param(1, Body(new ZodPipe(mediationDecision))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ExchangeMediationAdminController.prototype, "decide", null);
ExchangeMediationAdminController = __decorate([
    Controller('v1/admin/exchanges/mediations'),
    __metadata("design:paramtypes", [ExchangesService])
], ExchangeMediationAdminController);
export { ExchangeMediationAdminController };
const adminListSchema = z.strictObject({
    status: z.enum(EXCHANGE_STATUSES).optional(),
    storeId: z.uuid().optional(),
    q: z.string().trim().min(3).max(12).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.string().max(4).optional(),
});
const waiveSchema = z.strictObject({ reason: z.string().trim().min(10).max(160) });
/** AT3/M3: lista, detalhe e isenção da taxa de coleta. Rotas próprias (`exchange-requests`) para não colidir com `exchanges/mediations`. */
let ExchangeRequestsAdminController = class ExchangeRequestsAdminController {
    exchanges;
    constructor(exchanges) {
        this.exchanges = exchanges;
    }
    list(query) {
        return this.exchanges.listForAdmin(query);
    }
    get(id) {
        return this.exchanges.getForAdmin(idParam(id));
    }
    waive(id, body, ctx) {
        return this.exchanges.waiveFee(idParam(id), body.reason, ctx);
    }
};
__decorate([
    AdminOnly('exchanges:read'),
    Get(),
    __param(0, Query(new ZodPipe(adminListSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ExchangeRequestsAdminController.prototype, "list", null);
__decorate([
    AdminOnly('exchanges:read'),
    Get(':id'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ExchangeRequestsAdminController.prototype, "get", null);
__decorate([
    AdminOnly('exchanges:waive-fee'),
    HttpCode(200),
    RateLimit({ name: 'admin-exchange-waive-fee', limit: 60, windowSeconds: 3600 }),
    Post(':id/waive-fee'),
    __param(0, Param('id')),
    __param(1, Body(new ZodPipe(waiveSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ExchangeRequestsAdminController.prototype, "waive", null);
ExchangeRequestsAdminController = __decorate([
    Controller('v1/admin/exchange-requests'),
    __metadata("design:paramtypes", [ExchangesService])
], ExchangeRequestsAdminController);
export { ExchangeRequestsAdminController };
//# sourceMappingURL=exchanges.controllers.js.map