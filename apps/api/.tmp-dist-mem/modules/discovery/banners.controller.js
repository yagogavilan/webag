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
import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, Public } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { BANNER_DESTINATIONS } from './db/schema.js';
import { BannersService } from './banners.service.js';
const publicQuery = z.strictObject({ cityId: z.uuid().optional() });
const date = z.iso.datetime().transform((v) => new Date(v));
const bannerShape = {
    title: z.string().trim().min(1).max(80),
    imageAssetId: z.uuid(),
    cityId: z.uuid().nullish(),
    destinationType: z.enum(BANNER_DESTINATIONS),
    destinationId: z.uuid().nullish(),
    destinationCode: z.string().trim().min(1).max(20).nullish(),
    startsAt: date,
    endsAt: date,
    position: z.number().int().min(0).max(999).optional(),
    active: z.boolean().optional(),
};
const eventSchema = z.strictObject({ type: z.enum(['impression', 'click']) });
const createSchema = z.strictObject(bannerShape);
const updateSchema = z.strictObject(Object.fromEntries(Object.entries(bannerShape).map(([k, v]) => [k, v.optional()])));
let BannersController = class BannersController {
    banners;
    constructor(banners) {
        this.banners = banners;
    }
    /** Público (o app navega sem login, WB-005). Mesmo conteúdo para todos: pode ficar em cache compartilhado. */
    async list(query) {
        return { data: await this.banners.listPublic(query.cityId), nextCursor: null };
    }
    /** O app avisa a impressão e o clique do banner (WB-115 C5). Público, com limite por IP; banner fora do ar não conta. */
    async event(id, body) {
        await this.banners.recordEvent(uuidParam(id), body.type);
    }
    async listAdmin() {
        return { data: await this.banners.listAdmin(), nextCursor: null };
    }
    create(body, ctx) {
        return this.banners.create(body, ctx);
    }
    update(id, body, ctx) {
        return this.banners.update(uuidParam(id), body, ctx);
    }
    async remove(id, ctx) {
        await this.banners.remove(uuidParam(id), ctx);
    }
};
__decorate([
    Public(),
    RateLimit({ name: 'banners-public', limit: 120, windowSeconds: 60 }),
    Get('banners'),
    Header('Cache-Control', 'public, max-age=60'),
    __param(0, Query(new ZodPipe(publicQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BannersController.prototype, "list", null);
__decorate([
    Public(),
    HttpCode(204),
    RateLimit({ name: 'banner-event', limit: 240, windowSeconds: 60 }),
    Post('banners/:bannerId/events'),
    __param(0, Param('bannerId')),
    __param(1, Body(new ZodPipe(eventSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BannersController.prototype, "event", null);
__decorate([
    AdminOnly('banners:read'),
    Get('admin/banners'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BannersController.prototype, "listAdmin", null);
__decorate([
    AdminOnly('banners:write'),
    Post('admin/banners'),
    __param(0, Body(new ZodPipe(createSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], BannersController.prototype, "create", null);
__decorate([
    AdminOnly('banners:write'),
    Patch('admin/banners/:bannerId'),
    __param(0, Param('bannerId')),
    __param(1, Body(new ZodPipe(updateSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], BannersController.prototype, "update", null);
__decorate([
    AdminOnly('banners:write'),
    HttpCode(204),
    Delete('admin/banners/:bannerId'),
    __param(0, Param('bannerId')),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BannersController.prototype, "remove", null);
BannersController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [BannersService])
], BannersController);
export { BannersController };
//# sourceMappingURL=banners.controller.js.map