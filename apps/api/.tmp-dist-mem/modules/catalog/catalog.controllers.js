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
import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AdminOnly, Ctx, CurrentPrincipal, StorePermission } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { IdempotencyService, parseIdempotencyKey } from '../idempotency/index.js';
import { StoresService, uuidParam } from '../stores/index.js';
import { adminProductsQuerySchema, bulkSchema, createProductSchema, importQuerySchema, listProductsSchema, moderateSchema, moderationTermSchema, sectionOrderSchema, sectionSchema, setImagesSchema, setVariantsSchema, stockAdjustSchema, updateProductSchema } from './catalog.schemas.js';
import { CatalogService } from './catalog.service.js';
import { ModerationService } from './moderation.service.js';
/** Catálogo da loja: funcionário precisa da permissão `catalog`; não-membro recebe 404 (SEC-020). */
let CatalogController = class CatalogController {
    catalog;
    stores;
    idempotency;
    constructor(catalog, stores, idempotency) {
        this.catalog = catalog;
        this.stores = stores;
        this.idempotency = idempotency;
    }
    store(storeId) {
        return this.stores.getStore(uuidParam(storeId));
    }
    async list(storeId, query) {
        return this.catalog.list(await this.store(storeId), { ...query, lowStock: query.lowStock === 'true' });
    }
    async create(principal, storeId, body, idempotencyKey) {
        if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey))
            throw errors.validation([{ field: 'Idempotency-Key', message: 'Use de 8 a 80 caracteres (letras, números, - e _).' }]);
        return this.catalog.create(await this.store(storeId), { userId: principal.userId }, body, idempotencyKey ?? null);
    }
    importTemplate() {
        return this.catalog.importTemplate();
    }
    /** Corpo `text/csv` (até 1 MB, 500 linhas). `mode=preview` valida e resume; `mode=commit` cria as válidas como rascunho. */
    async importCsv(principal, storeId, query, body, idempotencyKey) {
        if (typeof body !== 'string')
            throw errors.validation([{ field: 'file', message: 'Envie o arquivo CSV com Content-Type text/csv.' }]);
        const store = await this.store(storeId);
        const run = () => this.catalog.importCsv(store, { userId: principal.userId }, body, query.mode, query.onExisting);
        // I9: só o commit muda dados; a prévia não precisa de chave.
        if (query.mode !== 'commit')
            return run();
        return this.idempotency.run(`import:${store.id}`, parseIdempotencyKey(idempotencyKey), { csv: body, ...query }, run);
    }
    async bulk(principal, storeId, body, idempotencyKey) {
        const store = await this.store(storeId);
        return this.idempotency.run(`bulk:${store.id}`, parseIdempotencyKey(idempotencyKey), body, () => this.catalog.bulk(store, { userId: principal.userId }, body));
    }
    async get(storeId, productId) {
        return this.catalog.get(await this.store(storeId), uuidParam(productId));
    }
    async update(principal, storeId, productId, body) {
        return this.catalog.update(await this.store(storeId), { userId: principal.userId }, uuidParam(productId), body);
    }
    async setVariants(principal, storeId, productId, body) {
        return this.catalog.setVariants(await this.store(storeId), { userId: principal.userId }, uuidParam(productId), body);
    }
    async stock(principal, storeId, productId, variantId, body, idempotencyKey) {
        const store = await this.store(storeId);
        const ids = { productId: uuidParam(productId), variantId: uuidParam(variantId) };
        return this.idempotency.run(`stock:${store.id}`, parseIdempotencyKey(idempotencyKey), { ...ids, ...body }, () => this.catalog.adjustStock(store, { userId: principal.userId }, ids.productId, ids.variantId, body));
    }
    async setImages(principal, storeId, productId, body) {
        return this.catalog.setImages(await this.store(storeId), { userId: principal.userId }, uuidParam(productId), body.imageIds);
    }
    async publish(principal, storeId, productId) {
        return this.catalog.publish(await this.store(storeId), { userId: principal.userId }, uuidParam(productId));
    }
    async pause(principal, storeId, productId) {
        return this.catalog.pause(await this.store(storeId), { userId: principal.userId }, uuidParam(productId));
    }
    async resume(principal, storeId, productId) {
        return this.catalog.resume(await this.store(storeId), { userId: principal.userId }, uuidParam(productId));
    }
    async archive(principal, storeId, productId) {
        await this.catalog.archive(await this.store(storeId), { userId: principal.userId }, uuidParam(productId));
    }
    // ------------------------------------------------------------------- seções
    async sections(storeId) {
        return { data: await this.catalog.sections(await this.store(storeId)), nextCursor: null };
    }
    async createSection(storeId, body) {
        return this.catalog.createSection(await this.store(storeId), body.name);
    }
    async orderSections(storeId, body) {
        await this.catalog.orderSections(await this.store(storeId), body.ids);
    }
    async renameSection(storeId, sectionId, body) {
        return this.catalog.renameSection(await this.store(storeId), uuidParam(sectionId), body.name);
    }
    async deleteSection(storeId, sectionId) {
        await this.catalog.deleteSection(await this.store(storeId), uuidParam(sectionId));
    }
};
__decorate([
    StorePermission('catalog'),
    Get('products'),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(listProductsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "list", null);
__decorate([
    StorePermission('catalog'),
    RateLimit({ name: 'product-create', limit: 120, windowSeconds: 3600 }),
    Post('products'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Body(new ZodPipe(createProductSchema))),
    __param(3, Headers('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "create", null);
__decorate([
    StorePermission('catalog'),
    Get('products/import/template'),
    Header('Content-Type', 'text/csv; charset=utf-8'),
    Header('Content-Disposition', 'attachment; filename="modelo-produtos.csv"'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], CatalogController.prototype, "importTemplate", null);
__decorate([
    StorePermission('catalog'),
    RateLimit({ name: 'product-import', limit: 20, windowSeconds: 3600 }),
    HttpCode(200),
    Post('products/import'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Query(new ZodPipe(importQuerySchema))),
    __param(3, Body()),
    __param(4, Headers('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "importCsv", null);
__decorate([
    StorePermission('catalog'),
    HttpCode(200),
    Post('products/bulk'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Body(new ZodPipe(bulkSchema))),
    __param(3, Headers('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "bulk", null);
__decorate([
    StorePermission('catalog'),
    Get('products/:productId'),
    __param(0, Param('storeId')),
    __param(1, Param('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "get", null);
__decorate([
    StorePermission('catalog'),
    Patch('products/:productId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('productId')),
    __param(3, Body(new ZodPipe(updateProductSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "update", null);
__decorate([
    StorePermission('catalog'),
    Put('products/:productId/variants'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('productId')),
    __param(3, Body(new ZodPipe(setVariantsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "setVariants", null);
__decorate([
    StorePermission('catalog'),
    HttpCode(200),
    Post('products/:productId/variants/:variantId/stock'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('productId')),
    __param(3, Param('variantId')),
    __param(4, Body(new ZodPipe(stockAdjustSchema))),
    __param(5, Headers('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "stock", null);
__decorate([
    StorePermission('catalog'),
    Put('products/:productId/images'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('productId')),
    __param(3, Body(new ZodPipe(setImagesSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "setImages", null);
__decorate([
    StorePermission('catalog'),
    HttpCode(200),
    Post('products/:productId/publish'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "publish", null);
__decorate([
    StorePermission('catalog'),
    HttpCode(200),
    Post('products/:productId/pause'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "pause", null);
__decorate([
    StorePermission('catalog'),
    HttpCode(200),
    Post('products/:productId/resume'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "resume", null);
__decorate([
    StorePermission('catalog'),
    HttpCode(204),
    Delete('products/:productId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __param(2, Param('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "archive", null);
__decorate([
    StorePermission('catalog'),
    Get('sections'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "sections", null);
__decorate([
    StorePermission('catalog'),
    Post('sections'),
    __param(0, Param('storeId')),
    __param(1, Body(new ZodPipe(sectionSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "createSection", null);
__decorate([
    StorePermission('catalog'),
    HttpCode(204),
    Put('sections/order'),
    __param(0, Param('storeId')),
    __param(1, Body(new ZodPipe(sectionOrderSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "orderSections", null);
__decorate([
    StorePermission('catalog'),
    Patch('sections/:sectionId'),
    __param(0, Param('storeId')),
    __param(1, Param('sectionId')),
    __param(2, Body(new ZodPipe(sectionSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "renameSection", null);
__decorate([
    StorePermission('catalog'),
    HttpCode(204),
    Delete('sections/:sectionId'),
    __param(0, Param('storeId')),
    __param(1, Param('sectionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "deleteSection", null);
CatalogController = __decorate([
    Controller('v1/stores/:storeId'),
    __metadata("design:paramtypes", [CatalogService,
        StoresService,
        IdempotencyService])
], CatalogController);
export { CatalogController };
/** Moderação de produtos e das duas listas (WB-107): só super admin e operação (RN-13). */
let AdminModerationController = class AdminModerationController {
    moderation;
    constructor(moderation) {
        this.moderation = moderation;
    }
    async list(query) {
        return this.moderation.list({ ...query, from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined });
    }
    moderate(principal, productId, body, ctx) {
        return this.moderation.moderate(principal, uuidParam(productId), body, ctx);
    }
    async terms() {
        return { data: await this.moderation.terms(), nextCursor: null };
    }
    addTerm(principal, body, ctx) {
        return this.moderation.addTerm(principal, body, ctx);
    }
    async removeTerm(termId, ctx) {
        await this.moderation.removeTerm(uuidParam(termId), ctx);
    }
};
__decorate([
    AdminOnly('products:read'),
    Get('products'),
    __param(0, Query(new ZodPipe(adminProductsQuerySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "list", null);
__decorate([
    AdminOnly('products:moderate'),
    HttpCode(200),
    Post('products/:productId/moderation'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('productId')),
    __param(2, Body(new ZodPipe(moderateSchema))),
    __param(3, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminModerationController.prototype, "moderate", null);
__decorate([
    AdminOnly('moderation:read'),
    Get('moderation/terms'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "terms", null);
__decorate([
    AdminOnly('moderation:write'),
    Post('moderation/terms'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(moderationTermSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminModerationController.prototype, "addTerm", null);
__decorate([
    AdminOnly('moderation:write'),
    HttpCode(204),
    Delete('moderation/terms/:termId'),
    __param(0, Param('termId')),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "removeTerm", null);
AdminModerationController = __decorate([
    Controller('v1/admin'),
    __metadata("design:paramtypes", [ModerationService])
], AdminModerationController);
export { AdminModerationController };
//# sourceMappingURL=catalog.controllers.js.map