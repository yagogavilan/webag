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
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { FavoritesService } from './favorites.service.js';
import { SearchHistoryService } from './search-history.service.js';
const listQuery = z.strictObject({ kind: z.enum(['store', 'product']).optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const recordSchema = z.strictObject({ term: z.string().trim().min(2, 'Digite ao menos 2 letras.').max(80) });
/** Favoritos e histórico de buscas da conta logada (WB-019, WB-015). O dono é sempre o `userId` do token. */
let MeDiscoveryController = class MeDiscoveryController {
    favorites;
    history;
    constructor(favorites, history) {
        this.favorites = favorites;
        this.history = history;
    }
    list(principal, q) {
        return this.favorites.list(principal.userId, q);
    }
    async addStore(principal, storeId) {
        await this.favorites.addStore(principal.userId, uuidParam(storeId));
    }
    async removeStore(principal, storeId) {
        await this.favorites.removeStore(principal.userId, uuidParam(storeId));
    }
    async addProduct(principal, productId) {
        await this.favorites.addProduct(principal.userId, uuidParam(productId));
    }
    async removeProduct(principal, productId) {
        await this.favorites.removeProduct(principal.userId, uuidParam(productId));
    }
    async listHistory(principal) {
        return { data: await this.history.list(principal.userId), nextCursor: null };
    }
    async record(principal, body) {
        await this.history.record(principal.userId, body.term);
    }
    async clear(principal) {
        await this.history.clear(principal.userId);
    }
};
__decorate([
    Get('favorites'),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(listQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MeDiscoveryController.prototype, "list", null);
__decorate([
    HttpCode(204),
    RateLimit({ name: 'favorite-write', limit: 120, windowSeconds: 3600 }),
    Put('favorites/stores/:storeId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MeDiscoveryController.prototype, "addStore", null);
__decorate([
    HttpCode(204),
    Delete('favorites/stores/:storeId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MeDiscoveryController.prototype, "removeStore", null);
__decorate([
    HttpCode(204),
    RateLimit({ name: 'favorite-write', limit: 120, windowSeconds: 3600 }),
    Put('favorites/products/:productId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MeDiscoveryController.prototype, "addProduct", null);
__decorate([
    HttpCode(204),
    Delete('favorites/products/:productId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MeDiscoveryController.prototype, "removeProduct", null);
__decorate([
    Get('search-history'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MeDiscoveryController.prototype, "listHistory", null);
__decorate([
    HttpCode(204),
    RateLimit({ name: 'search-history-write', limit: 300, windowSeconds: 3600 }),
    Post('search-history'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(recordSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MeDiscoveryController.prototype, "record", null);
__decorate([
    HttpCode(204),
    Delete('search-history'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MeDiscoveryController.prototype, "clear", null);
MeDiscoveryController = __decorate([
    Controller('v1/me'),
    __metadata("design:paramtypes", [FavoritesService,
        SearchHistoryService])
], MeDiscoveryController);
export { MeDiscoveryController };
//# sourceMappingURL=me-discovery.controller.js.map