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
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { HighlightsService } from './highlights.service.js';
import { PlatformCouponsService } from './platform-coupons.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound();
    return value;
};
const date = z.iso.datetime().transform((v) => new Date(v));
const couponCreate = z.strictObject({
    code: z.string().trim().toUpperCase().min(4).max(20),
    kind: z.enum(['percent', 'fixed', 'free_shipping']),
    value: z.number().int().min(0).max(10_000_000).default(0),
    percentCapCents: z.number().int().min(1).nullish(),
    minOrderCents: z.number().int().min(0).default(0),
    startsAt: date,
    endsAt: date,
    maxUses: z.number().int().min(1).nullish(),
    perCustomerLimit: z.number().int().min(1).max(100).default(1),
    firstPurchaseOnly: z.boolean().default(false),
});
const couponPatch = z.strictObject({
    value: z.number().int().min(0).max(10_000_000).optional(),
    percentCapCents: z.number().int().min(1).nullable().optional(),
    minOrderCents: z.number().int().min(0).optional(),
    endsAt: date.optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
    perCustomerLimit: z.number().int().min(1).max(100).optional(),
    firstPurchaseOnly: z.boolean().optional(),
    active: z.boolean().optional(),
});
const couponList = z.strictObject({ status: z.enum(['scheduled', 'live', 'paused', 'ended', 'exhausted']).optional(), q: z.string().trim().min(1).max(20).optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
/** WB-116: cupons da plataforma (custo da Webag). */
let AdminCouponsController = class AdminCouponsController {
    coupons;
    constructor(coupons) {
        this.coupons = coupons;
    }
    list(query) {
        return this.coupons.list(query);
    }
    get(id) {
        return this.coupons.get(idParam(id));
    }
    create(ctx, body) {
        return this.coupons.create(ctx, body);
    }
    update(ctx, id, body) {
        return this.coupons.update(ctx, idParam(id), body);
    }
};
__decorate([
    AdminOnly('coupons:read'),
    Get(),
    __param(0, Query(new ZodPipe(couponList))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminCouponsController.prototype, "list", null);
__decorate([
    AdminOnly('coupons:read'),
    Get(':id'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminCouponsController.prototype, "get", null);
__decorate([
    AdminOnly('coupons:write'),
    Post(),
    RateLimit({ name: 'admin-coupon-write', limit: 60, windowSeconds: 3600 }),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(couponCreate))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminCouponsController.prototype, "create", null);
__decorate([
    AdminOnly('coupons:write'),
    Patch(':id'),
    RateLimit({ name: 'admin-coupon-write', limit: 60, windowSeconds: 3600 }),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(couponPatch))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminCouponsController.prototype, "update", null);
AdminCouponsController = __decorate([
    Controller('v1/admin/coupons'),
    __metadata("design:paramtypes", [PlatformCouponsService])
], AdminCouponsController);
export { AdminCouponsController };
const highlightCreate = z.strictObject({
    kind: z.enum(['store', 'product']),
    targetId: z.uuid(),
    cityId: z.uuid().nullish(),
    startsAt: date,
    endsAt: date,
    position: z.number().int().min(0).max(999).optional(),
    active: z.boolean().optional(),
});
const highlightPatch = z.strictObject({ cityId: z.uuid().nullable().optional(), startsAt: date.optional(), endsAt: date.optional(), position: z.number().int().min(0).max(999).optional(), active: z.boolean().optional() });
/** WB-115 C4: destaques fixados na Início. Mesmas permissões dos banners (`banners:*`). */
let AdminHighlightsController = class AdminHighlightsController {
    highlights;
    constructor(highlights) {
        this.highlights = highlights;
    }
    list() {
        return this.highlights.list();
    }
    create(ctx, body) {
        return this.highlights.create(ctx, body);
    }
    update(ctx, id, body) {
        return this.highlights.update(ctx, idParam(id), body);
    }
    async remove(ctx, id) {
        await this.highlights.remove(ctx, idParam(id));
    }
};
__decorate([
    AdminOnly('banners:read'),
    Get(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminHighlightsController.prototype, "list", null);
__decorate([
    AdminOnly('banners:write'),
    Post(),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(highlightCreate))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminHighlightsController.prototype, "create", null);
__decorate([
    AdminOnly('banners:write'),
    Patch(':id'),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(highlightPatch))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminHighlightsController.prototype, "update", null);
__decorate([
    AdminOnly('banners:write'),
    Delete(':id'),
    HttpCode(204),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminHighlightsController.prototype, "remove", null);
AdminHighlightsController = __decorate([
    Controller('v1/admin/highlights'),
    __metadata("design:paramtypes", [HighlightsService])
], AdminHighlightsController);
export { AdminHighlightsController };
//# sourceMappingURL=marketing-admin.controller.js.map