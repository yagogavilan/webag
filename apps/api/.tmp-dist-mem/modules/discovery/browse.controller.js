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
import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { BrowseService } from './browse.service.js';
import { geoQuery } from './geo.js';
const storeQuery = z.strictObject({ lat: geoQuery.lat.optional(), lng: geoQuery.lng.optional() }).refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: 'Informe latitude e longitude juntas.', path: ['lat'] });
const listQuery = z.strictObject({ sectionId: z.uuid().optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const pageQuery = z.strictObject({ cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const SHORT = 'public, max-age=30';
/** Loja e produto públicos (WB-016, WB-017, WB-018). Sem login; loja fechada é navegável (DEC-022). */
let BrowseController = class BrowseController {
    browse;
    constructor(browse) {
        this.browse = browse;
    }
    /** Com `lat`/`lng` calcula a entrega para aquela posição; sem elas, só os dados da loja. Posição no query => cache só no aparelho. */
    store(storeId, q) {
        return this.browse.store(uuidParam(storeId), q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null);
    }
    storeProducts(storeId, q) {
        return this.browse.storeProducts(uuidParam(storeId), q);
    }
    storeReviews(storeId, q) {
        return this.browse.reviewsOf({ storeId: uuidParam(storeId) }, q);
    }
    product(productId, q) {
        // Com `lat`/`lng` a página traz a entrega e o ETA (DEC-053) para aquela posição; sem elas, só o produto.
        return this.browse.product(uuidParam(productId), q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null);
    }
    productReviews(productId, q) {
        return this.browse.reviewsOf({ productId: uuidParam(productId) }, q);
    }
};
__decorate([
    Public(),
    RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 }),
    Get('stores/:storeId'),
    Header('Cache-Control', 'private, max-age=30'),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(storeQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BrowseController.prototype, "store", null);
__decorate([
    Public(),
    RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 }),
    Get('stores/:storeId/products'),
    Header('Cache-Control', SHORT),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(listQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BrowseController.prototype, "storeProducts", null);
__decorate([
    Public(),
    RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 }),
    Get('stores/:storeId/reviews'),
    Header('Cache-Control', SHORT),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(pageQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BrowseController.prototype, "storeReviews", null);
__decorate([
    Public(),
    RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 }),
    Get('products/:productId'),
    Header('Cache-Control', 'private, max-age=30'),
    __param(0, Param('productId')),
    __param(1, Query(new ZodPipe(storeQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BrowseController.prototype, "product", null);
__decorate([
    Public(),
    RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 }),
    Get('products/:productId/reviews'),
    Header('Cache-Control', SHORT),
    __param(0, Param('productId')),
    __param(1, Query(new ZodPipe(pageQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BrowseController.prototype, "productReviews", null);
BrowseController = __decorate([
    Controller('v1/browse'),
    __metadata("design:paramtypes", [BrowseService])
], BrowseController);
export { BrowseController };
//# sourceMappingURL=browse.controller.js.map