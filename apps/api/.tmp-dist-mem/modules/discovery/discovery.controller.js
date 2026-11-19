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
import { Controller, Get, Header, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { DiscoveryService } from './discovery.service.js';
import { geoQuery } from './geo.js';
const bool = z.enum(['true']).transform(() => true);
const money = z.coerce.number().int().min(0).max(9_999_999);
const common = {
    ...geoQuery,
    q: z.string().trim().max(80).optional(),
    categoryId: z.uuid().optional(),
    maxDistanceKm: z.coerce.number().min(0.5).max(50).optional(),
    freeShipping: bool.optional(),
    minRating: z.coerce.number().min(1).max(5).optional(),
    acceptsExchange: bool.optional(),
    cursor: z.string().max(200).optional(),
    limit: z.string().max(4).optional(),
};
const homeQuery = z.strictObject({ ...geoQuery, mode: z.enum(['delivery', 'pickup']).default('delivery') });
const storesQuery = z.strictObject({ ...common, sort: z.enum(['relevance', 'distance', 'rating', 'fee', 'eta']).default('relevance') });
const productsQuery = z
    .strictObject({ ...common, minPriceCents: money.optional(), maxPriceCents: money.optional(), sort: z.enum(['relevance', 'price_asc', 'distance', 'rating', 'discount']).default('relevance') })
    .refine((v) => v.minPriceCents === undefined || v.maxPriceCents === undefined || v.minPriceCents <= v.maxPriceCents, { message: 'O preço mínimo não pode passar do máximo.', path: ['minPriceCents'] });
const suggestionsQuery = z.strictObject({ ...geoQuery, q: z.string().trim().max(80) });
/** Resposta de descoberta é por posição e vira lixo logo: cache curto no aparelho, nunca em cache compartilhado. */
const PRIVATE_SHORT_CACHE = 'private, max-age=30';
/**
 * Descoberta pública (WB-005: navegar sem login). A posição vem de `lat`/`lng` (o app a tem do endereço salvo, do CEP
 * ou do GPS). Rate limit por IP; as coordenadas são mascaradas no log de acesso (app.module).
 */
let DiscoveryController = class DiscoveryController {
    discovery;
    constructor(discovery) {
        this.discovery = discovery;
    }
    home(q) {
        return this.discovery.home({ lat: q.lat, lng: q.lng }, q.mode);
    }
    searchStores(q) {
        if (q.q !== undefined && q.q.length > 0 && q.q.length < 2)
            throw errors.validation([{ field: 'q', message: 'Digite ao menos 2 letras.' }]);
        const { lat, lng, ...filters } = q;
        return this.discovery.searchStores({ lat, lng }, filters);
    }
    searchProducts(q) {
        if (q.q !== undefined && q.q.length > 0 && q.q.length < 2)
            throw errors.validation([{ field: 'q', message: 'Digite ao menos 2 letras.' }]);
        const { lat, lng, ...filters } = q;
        return this.discovery.searchProducts({ lat, lng }, filters);
    }
    async suggestions(q) {
        return this.discovery.suggestions({ lat: q.lat, lng: q.lng }, q.q);
    }
};
__decorate([
    Public(),
    RateLimit({ name: 'discovery', limit: 120, windowSeconds: 60 }),
    Get('home'),
    Header('Cache-Control', PRIVATE_SHORT_CACHE),
    __param(0, Query(new ZodPipe(homeQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DiscoveryController.prototype, "home", null);
__decorate([
    Public(),
    RateLimit({ name: 'search', limit: 90, windowSeconds: 60 }),
    Get('search/stores'),
    Header('Cache-Control', PRIVATE_SHORT_CACHE),
    __param(0, Query(new ZodPipe(storesQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DiscoveryController.prototype, "searchStores", null);
__decorate([
    Public(),
    RateLimit({ name: 'search', limit: 90, windowSeconds: 60 }),
    Get('search/products'),
    Header('Cache-Control', PRIVATE_SHORT_CACHE),
    __param(0, Query(new ZodPipe(productsQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DiscoveryController.prototype, "searchProducts", null);
__decorate([
    Public(),
    RateLimit({ name: 'search', limit: 90, windowSeconds: 60 }),
    Get('search/suggestions'),
    Header('Cache-Control', PRIVATE_SHORT_CACHE),
    __param(0, Query(new ZodPipe(suggestionsQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DiscoveryController.prototype, "suggestions", null);
DiscoveryController = __decorate([
    Controller('v1'),
    __metadata("design:paramtypes", [DiscoveryService])
], DiscoveryController);
export { DiscoveryController };
//# sourceMappingURL=discovery.controller.js.map