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
import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { MY_COUPON_STATUSES, MyCouponsService } from './my-coupons.service.js';
const listQuery = z.strictObject({
    status: z.enum(MY_COUPON_STATUSES).default('available'),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
});
let MyCouponsController = class MyCouponsController {
    coupons;
    constructor(coupons) {
        this.coupons = coupons;
    }
    list(principal, q) {
        return this.coupons.list(principal.userId, q);
    }
};
__decorate([
    RateLimit({ name: 'my-coupons', limit: 120, windowSeconds: 600 }),
    Get(),
    __param(0, CurrentPrincipal()),
    __param(1, Query(new ZodPipe(listQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MyCouponsController.prototype, "list", null);
MyCouponsController = __decorate([
    Controller('v1/me/coupons'),
    __metadata("design:paramtypes", [MyCouponsService])
], MyCouponsController);
export { MyCouponsController };
//# sourceMappingURL=my-coupons.controller.js.map