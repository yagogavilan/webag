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
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, RequireReauth } from '../../platform/auth/decorators.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { MediaService } from '../media/index.js';
import { AdminStoresService } from './admin-stores.service.js';
import { STORE_STATUSES } from './domain/state.js';
import { PaymentAccountService } from './payment-account.service.js';
import { StoreSettingsService } from './store-settings.service.js';
import { adminStorePatchSchema, correctionSchema, decisionReasonSchema, deliverySchema, documentAccessSchema, exchangePolicySchema, holidaysSchema, hoursSchema, pickupSchema, releaseAccountSchema, } from './stores.schemas.js';
import { presentStore, uuidParam } from './stores.controllers.js';
import { StoresService } from './stores.service.js';
const listQuery = z.strictObject({ status: z.enum(STORE_STATUSES).optional(), cursor: z.string().max(300).optional(), limit: z.coerce.number().int().min(1).max(50).optional() });
const SECTION_SCHEMAS = {
    hours: hoursSchema,
    holidays: holidaysSchema,
    delivery: deliverySchema,
    pickup: pickupSchema,
    'exchange-policy': exchangePolicySchema,
};
/** Fila de aprovação, decisões e edição de lojas pelo admin (WB-103/104/218). Permissões na tabela única (SEC-021). */
let AdminStoresController = class AdminStoresController {
    admin;
    stores;
    settings;
    accounts;
    media;
    db;
    constructor(admin, stores, settings, accounts, media, db) {
        this.admin = admin;
        this.stores = stores;
        this.settings = settings;
        this.accounts = accounts;
        this.media = media;
        this.db = db;
    }
    present(store) {
        return presentStore({ stores: this.stores, media: this.media, db: this.db }, store, 'admin');
    }
    list(query) {
        return this.admin.list(query);
    }
    async detail(storeId) {
        const detail = await this.admin.detail(uuidParam(storeId));
        return {
            store: await this.present(detail.store),
            owner: detail.owner,
            documents: detail.documents.map((d) => ({ id: d.id, kind: d.kind, uploadedAt: d.createdAt.toISOString(), current: d.supersededAt === null })),
            reviewItems: detail.items.map((i) => ({ item: i.item, reason: i.reason })),
            history: detail.history.map((h) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt.toISOString(), reason: h.reason })),
            paymentAccount: detail.account ? { status: detail.account.status, holderDocumentMasked: detail.account.holderDocumentMasked, holderMatchesStore: detail.account.holderMatchesStore } : null,
            sameDocument: detail.sameDocument,
            settings: await this.settings.present(detail.store),
        };
    }
    async documentAccess(ctx, storeId, documentId, body) {
        return this.admin.documentAccessUrl(uuidParam(storeId), uuidParam(documentId), body.reason, ctx);
    }
    async approve(admin, ctx, storeId) {
        return this.present(await this.admin.approve(uuidParam(storeId), admin, ctx));
    }
    async correction(admin, ctx, storeId, body) {
        return this.present(await this.admin.requestCorrection(uuidParam(storeId), admin, body.items, ctx));
    }
    async reject(admin, ctx, storeId, body) {
        return this.present(await this.admin.reject(uuidParam(storeId), admin, body.reason, ctx));
    }
    async suspend(admin, ctx, storeId, body) {
        return this.present(await this.admin.suspend(uuidParam(storeId), admin, body.reason, ctx));
    }
    async reactivate(admin, ctx, storeId) {
        return this.present(await this.admin.reactivate(uuidParam(storeId), admin, ctx));
    }
    /** WB-104 C3: editar dado da loja grava antes/depois na auditoria; suporte e financeiro não editam. */
    async patch(admin, ctx, storeId, body) {
        const store = await this.stores.getStore(uuidParam(storeId));
        const { store: updated } = await this.stores.updateProfile(store, body.profile ?? {}, { userId: admin.userId, kind: 'admin' }, ctx);
        return this.present(updated);
    }
    async section(admin, ctx, storeId, section, body) {
        const schema = SECTION_SCHEMAS[section];
        if (!schema)
            throw errors.notFound('Seção desconhecida.');
        const input = new ZodPipe(schema).transform(body);
        const store = await this.stores.getStore(uuidParam(storeId));
        const actor = { userId: admin.userId, kind: 'admin' };
        if (section === 'hours')
            await this.settings.setHours(store, input.days, actor, ctx);
        else if (section === 'holidays')
            await this.settings.setHolidays(store, input.holidays, actor, ctx);
        else if (section === 'delivery')
            await this.settings.setDelivery(store, input, actor, ctx);
        else if (section === 'pickup')
            await this.settings.setPickup(store, input, actor, ctx);
        else
            await this.settings.setExchangePolicy(store, input, actor, ctx);
    }
    /** WB-103 C7 / SEC-047: liberar conta com titular divergente exige TOTP vigente, motivo e auditoria. */
    async release(admin, ctx, storeId, body) {
        await this.accounts.release(uuidParam(storeId), admin.userId, body.reason, ctx);
    }
    async dataReview(ctx, storeId, decision, body) {
        if (decision !== 'approve' && decision !== 'reject')
            throw errors.notFound();
        return this.present(await this.admin.decideDataReview(uuidParam(storeId), decision === 'approve', body.reason, ctx));
    }
};
__decorate([
    AdminOnly('stores:read'),
    Get(),
    __param(0, Query(new ZodPipe(listQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminStoresController.prototype, "list", null);
__decorate([
    AdminOnly('stores:read'),
    Get(':storeId'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "detail", null);
__decorate([
    AdminOnly('stores:documents'),
    HttpCode(200),
    RateLimit({ name: 'doc-access', limit: 120, windowSeconds: 3600 }),
    Post(':storeId/documents/:documentId/access'),
    __param(0, Ctx()),
    __param(1, Param('storeId')),
    __param(2, Param('documentId')),
    __param(3, Body(new ZodPipe(documentAccessSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "documentAccess", null);
__decorate([
    AdminOnly('stores:decide'),
    HttpCode(200),
    Post(':storeId/approve'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "approve", null);
__decorate([
    AdminOnly('stores:decide'),
    HttpCode(200),
    Post(':storeId/request-correction'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(correctionSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "correction", null);
__decorate([
    AdminOnly('stores:decide'),
    HttpCode(200),
    Post(':storeId/reject'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(decisionReasonSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "reject", null);
__decorate([
    AdminOnly('stores:decide'),
    HttpCode(200),
    Post(':storeId/suspend'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(decisionReasonSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "suspend", null);
__decorate([
    AdminOnly('stores:decide'),
    HttpCode(200),
    Post(':storeId/reactivate'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "reactivate", null);
__decorate([
    AdminOnly('stores:write'),
    Patch(':storeId'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(adminStorePatchSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "patch", null);
__decorate([
    AdminOnly('stores:write'),
    HttpCode(204),
    Put(':storeId/settings/:section'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Param('section')),
    __param(4, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "section", null);
__decorate([
    AdminOnly('stores:decide'),
    RequireReauth(),
    HttpCode(204),
    Post(':storeId/payment-account/release'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('storeId')),
    __param(3, Body(new ZodPipe(releaseAccountSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "release", null);
__decorate([
    AdminOnly('stores:decide'),
    HttpCode(200),
    Post(':storeId/data-review/:decision'),
    __param(0, Ctx()),
    __param(1, Param('storeId')),
    __param(2, Param('decision')),
    __param(3, Body(new ZodPipe(decisionReasonSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], AdminStoresController.prototype, "dataReview", null);
AdminStoresController = __decorate([
    Controller('v1/admin/stores'),
    __param(5, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [AdminStoresService,
        StoresService,
        StoreSettingsService,
        PaymentAccountService,
        MediaService, Object])
], AdminStoresController);
export { AdminStoresController };
//# sourceMappingURL=admin-stores.controller.js.map