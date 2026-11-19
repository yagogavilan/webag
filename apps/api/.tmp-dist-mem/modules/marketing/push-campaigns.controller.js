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
import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { IdempotencyService, parseIdempotencyKey } from '../idempotency/index.js';
import { CAMPAIGN_STATUSES } from './db/schema.js';
import { PushCampaignsService } from './push-campaigns.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound('Campanha não encontrada.');
    return value;
};
const segmentSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('city'), cityId: z.uuid() }),
    z.strictObject({ kind: z.literal('neighborhood'), neighborhoodId: z.uuid() }),
    z.strictObject({ kind: z.literal('inactive'), days: z.number().int().min(7).max(365) }),
    z.strictObject({ kind: z.literal('bought_category'), categoryId: z.uuid() }),
    z.strictObject({ kind: z.literal('new_customers'), days: z.number().int().min(1).max(90) }),
]);
const destinationSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('home') }),
    z.strictObject({ type: z.literal('store'), id: z.uuid() }),
    z.strictObject({ type: z.literal('category'), id: z.uuid() }),
    z.strictObject({ type: z.literal('coupon'), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/) }),
]);
const estimateSchema = z.strictObject({ segment: segmentSchema });
const createSchema = z.strictObject({
    title: z.string().trim().min(1).max(60),
    body: z.string().trim().min(1).max(120),
    destination: destinationSchema,
    segment: segmentSchema,
    scheduleAt: z.coerce.date().optional(),
    expectedRecipients: z.number().int().min(0),
});
const listSchema = z.strictObject({ status: z.enum(CAMPAIGN_STATUSES).optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const cancelSchema = z.strictObject({ reason: z.string().trim().min(3).max(200) });
/** WB-197: push segmentado do admin (super admin e operação; financeiro e suporte não veem). */
let AdminPushController = class AdminPushController {
    campaigns;
    idempotency;
    constructor(campaigns, idempotency) {
        this.campaigns = campaigns;
        this.idempotency = idempotency;
    }
    /** Estimativa "Quem recebe": só entre quem aceitou receber ofertas; abaixo do mínimo a contagem exata não sai. */
    estimate(body) {
        return this.campaigns.estimate(body.segment);
    }
    list(query) {
        return this.campaigns.list(query);
    }
    get(id) {
        return this.campaigns.get(idParam(id));
    }
    /** Cria e agenda (ou envia na janela). `Idempotency-Key` evita campanha em dobro no duplo toque. 422 `SEGMENT_TOO_SMALL`, 409 `ESTIMATE_CHANGED`. */
    create(ctx, key, body) {
        return this.idempotency.run(`push-campaign:${ctx.principal?.userId ?? ''}`, parseIdempotencyKey(key), body, () => this.campaigns.create(ctx, body), { reusedStatus: 409 });
    }
    cancel(ctx, id, body) {
        return this.campaigns.cancel(ctx, idParam(id), body.reason);
    }
};
__decorate([
    AdminOnly('marketing:push'),
    Post('estimate'),
    HttpCode(200),
    RateLimit({ name: 'admin-push-estimate', limit: 120, windowSeconds: 3600 }),
    __param(0, Body(new ZodPipe(estimateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminPushController.prototype, "estimate", null);
__decorate([
    AdminOnly('marketing:push'),
    Get('campaigns'),
    __param(0, Query(new ZodPipe(listSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminPushController.prototype, "list", null);
__decorate([
    AdminOnly('marketing:push'),
    Get('campaigns/:id'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminPushController.prototype, "get", null);
__decorate([
    AdminOnly('marketing:push'),
    Post('campaigns'),
    RateLimit({ name: 'admin-push-create', limit: 30, windowSeconds: 3600 }),
    __param(0, Ctx()),
    __param(1, Headers('idempotency-key')),
    __param(2, Body(new ZodPipe(createSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminPushController.prototype, "create", null);
__decorate([
    AdminOnly('marketing:push'),
    Post('campaigns/:id/cancel'),
    HttpCode(200),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(cancelSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminPushController.prototype, "cancel", null);
AdminPushController = __decorate([
    Controller('v1/admin/push'),
    __metadata("design:paramtypes", [PushCampaignsService,
        IdempotencyService])
], AdminPushController);
export { AdminPushController };
/** O app avisa que o cliente abriu a notificação da campanha (métrica "abertos"). */
let PushCampaignOpenedController = class PushCampaignOpenedController {
    campaigns;
    constructor(campaigns) {
        this.campaigns = campaigns;
    }
    async opened(principal, id) {
        await this.campaigns.markOpened(principal.userId, idParam(id));
    }
};
__decorate([
    Post(':id/opened'),
    HttpCode(204),
    RateLimit({ name: 'push-campaign-opened', limit: 60, windowSeconds: 3600 }),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PushCampaignOpenedController.prototype, "opened", null);
PushCampaignOpenedController = __decorate([
    Controller('v1/me/push-campaigns'),
    __metadata("design:paramtypes", [PushCampaignsService])
], PushCampaignOpenedController);
export { PushCampaignOpenedController };
//# sourceMappingURL=push-campaigns.controller.js.map