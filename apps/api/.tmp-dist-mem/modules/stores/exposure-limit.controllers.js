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
import { Body, Controller, Get, HttpCode, Inject, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, StorePermission } from '../../platform/auth/decorators.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { AuditService } from '../admin/index.js';
import { ExposureLimitService } from './exposure-limit.service.js';
import { uuidParam } from './stores.controllers.js';
const putSchema = z
    .strictObject({
    mode: z.enum(['default', 'released', 'custom']),
    maxOrderCents: z.number().int().min(10_000).max(5_000_000).optional(),
    reason: z.string().trim().min(3).max(300),
})
    .refine((v) => (v.mode === 'custom') === (v.maxOrderCents !== undefined), { message: 'Informe maxOrderCents só no modo custom', path: ['maxOrderCents'] });
export const presentExposure = (limit) => ({
    active: limit.active,
    mode: limit.mode,
    maxOrder: limit.maxOrderCents === null ? null : { amount: limit.maxOrderCents, currency: 'BRL' },
    endsAt: limit.endsAt?.toISOString() ?? null,
    deliveredOrders: limit.deliveredOrders,
    ordersToEnd: limit.ordersToEnd,
});
/** Lojista (qualquer membro) vê o próprio limite para o banner "Loja nova: pedidos de até R$ 500,00". */
let StoreExposureController = class StoreExposureController {
    exposure;
    constructor(exposure) {
        this.exposure = exposure;
    }
    async get(storeId) {
        return presentExposure(await this.exposure.forStore(uuidParam(storeId)));
    }
};
__decorate([
    StorePermission('member'),
    Get(),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StoreExposureController.prototype, "get", null);
StoreExposureController = __decorate([
    Controller('v1/stores/:storeId/exposure-limit'),
    __metadata("design:paramtypes", [ExposureLimitService])
], StoreExposureController);
export { StoreExposureController };
/** Admin libera ou ajusta o teto com motivo; toda mudança é auditada (DEC-020b). */
let AdminExposureController = class AdminExposureController {
    exposure;
    audit;
    db;
    constructor(exposure, audit, db) {
        this.exposure = exposure;
        this.audit = audit;
        this.db = db;
    }
    async get(storeId) {
        return presentExposure(await this.exposure.forStore(uuidParam(storeId)));
    }
    async put(storeId, body, ctx) {
        const id = uuidParam(storeId);
        const actorId = ctx.principal?.userId;
        if (!actorId)
            throw errors.forbidden();
        await this.db.transaction(async (tx) => {
            const { before } = await this.exposure.configure(tx, id, { mode: body.mode, maxOrderCents: body.maxOrderCents ?? null, reason: body.reason, actorId });
            await this.audit.record(tx, ctx, { action: 'store.exposure_limit.set', targetType: 'store', targetId: id, before, after: { mode: body.mode, maxOrderCents: body.maxOrderCents ?? null }, reason: body.reason });
        });
        return presentExposure(await this.exposure.forStore(id));
    }
};
__decorate([
    AdminOnly('stores:read'),
    Get(),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminExposureController.prototype, "get", null);
__decorate([
    AdminOnly('stores:decide'),
    HttpCode(200),
    Put(),
    __param(0, Param('storeId')),
    __param(1, Body(new ZodPipe(putSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminExposureController.prototype, "put", null);
AdminExposureController = __decorate([
    Controller('v1/admin/stores/:storeId/exposure-limit'),
    __param(2, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [ExposureLimitService,
        AuditService, Object])
], AdminExposureController);
export { AdminExposureController };
//# sourceMappingURL=exposure-limit.controllers.js.map