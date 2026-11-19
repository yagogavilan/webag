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
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { ReviewsService } from './reviews.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderIdParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound('Pedido não encontrado.');
    return value;
};
const createSchema = z.strictObject({
    productId: z.uuid().optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
    fit: z.enum(['small', 'ok', 'large']).optional(),
});
/** Avaliações do cliente sobre um pedido entregue. Pedido de outra conta: 404. */
let ReviewsController = class ReviewsController {
    reviews;
    constructor(reviews) {
        this.reviews = reviews;
    }
    create(p, orderId, body) {
        return this.reviews.create(p.userId, orderIdParam(orderId), body);
    }
    list(p, orderId) {
        return this.reviews.listForOrder(p.userId, orderIdParam(orderId));
    }
};
__decorate([
    RateLimit({ name: 'review-create', limit: 60, windowSeconds: 3600 }),
    Post(),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __param(2, Body(new ZodPipe(createSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ReviewsController.prototype, "create", null);
__decorate([
    Get(),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReviewsController.prototype, "list", null);
ReviewsController = __decorate([
    Controller('v1/orders/:orderId/reviews'),
    __metadata("design:paramtypes", [ReviewsService])
], ReviewsController);
export { ReviewsController };
//# sourceMappingURL=reviews.controller.js.map