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
import { CartService } from './cart.service.js';
const contextQuery = z.strictObject({ mode: z.enum(['delivery', 'pickup']).default('delivery'), addressId: z.uuid().optional() });
const setItemSchema = z.strictObject({ quantity: z.number().int().min(1).max(999), replaceStore: z.boolean().optional() });
const couponSchema = z.strictObject({ code: z.string().trim().min(1).max(30) });
const mergeSchema = z.strictObject({
    items: z
        .array(z.strictObject({ variantId: z.uuid(), quantity: z.number().int().min(1).max(999) }))
        .max(50)
        .refine((items) => new Set(items.map((i) => i.variantId)).size === items.length, { message: 'Item repetido.' }),
});
const WRITE = { name: 'cart-write', limit: 600, windowSeconds: 3600 };
/**
 * Sacola da conta (ADR-010). Sempre do `userId` do token: não há `cartId` na URL, então não há IDOR possível.
 * Toda resposta é a sacola inteira com valores vigentes, para o app ajustar a tela com 1 requisição em 3G.
 */
let CartController = class CartController {
    cart;
    constructor(cart) {
        this.cart = cart;
    }
    get(principal, q) {
        return this.cart.get(principal, q);
    }
    clear(principal, q) {
        return this.cart.clear(principal, q);
    }
    setItem(principal, variantId, body, q) {
        return this.cart.setItem(principal, uuidParam(variantId), body, q);
    }
    removeItem(principal, variantId, q) {
        return this.cart.removeItem(principal, uuidParam(variantId), q);
    }
    /** Código de cupom adivinhado por tentativa e erro: limite curto por IP além do teto global. */
    applyCoupon(principal, body, q) {
        return this.cart.applyCoupon(principal, body.code, q);
    }
    removeCoupon(principal, q) {
        return this.cart.removeCoupon(principal, q);
    }
    acknowledge(principal, q) {
        return this.cart.acknowledge(principal, q);
    }
    merge(principal, body, q) {
        return this.cart.merge(principal, body, q);
    }
};
__decorate([
    Get(),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(contextQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "get", null);
__decorate([
    RateLimit(WRITE),
    Delete(),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(contextQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "clear", null);
__decorate([
    RateLimit(WRITE),
    Put('items/:variantId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('variantId')),
    __param(2, Body(new ZodPipe(setItemSchema))),
    __param(3, Query(new ZodPipe(contextQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "setItem", null);
__decorate([
    RateLimit(WRITE),
    Delete('items/:variantId'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('variantId')),
    __param(2, Query(new ZodPipe(contextQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "removeItem", null);
__decorate([
    RateLimit({ name: 'coupon-apply', limit: 30, windowSeconds: 3600 }),
    Put('coupon'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(couponSchema))),
    __param(2, Query(new ZodPipe(contextQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "applyCoupon", null);
__decorate([
    RateLimit(WRITE),
    Delete('coupon'),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(contextQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "removeCoupon", null);
__decorate([
    HttpCode(200),
    RateLimit(WRITE),
    Post('acknowledge'),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(contextQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "acknowledge", null);
__decorate([
    HttpCode(200),
    RateLimit({ name: 'cart-merge', limit: 60, windowSeconds: 3600 }),
    Post('merge'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(mergeSchema))),
    __param(2, Query(new ZodPipe(contextQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CartController.prototype, "merge", null);
CartController = __decorate([
    Controller('v1/cart'),
    __metadata("design:paramtypes", [CartService])
], CartController);
export { CartController };
//# sourceMappingURL=cart.controller.js.map