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
import { Body, Controller, Get, HttpCode, Param, Put } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx } from '../../platform/auth/decorators.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { AuditService } from '../admin/index.js';
import { categories } from '../admin/db/schema.js';
import { stores } from '../stores/db/schema.js';
import { CommissionService } from './commission.service.js';
import { pctToBp } from './domain/money.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value) => {
    if (!UUID.test(value))
        throw errors.notFound();
    return value;
};
/** `pct` em % com até 2 casas (8,5 = 8,50%); `null` remove o override (volta à regra seguinte). */
const rateSchema = z.strictObject({
    pct: z.number().min(0).max(30).multipleOf(0.01).nullable(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    reason: z.string().trim().min(3).max(300),
});
const presentRate = (row) => ({
    id: row.id,
    pct: row.pctBp === null ? null : row.pctBp / 100,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
});
/** WB-105 / WB-111: comissão por loja e por categoria. Financeiro e super admin; toda mudança é auditada com motivo (C3). */
let CommissionAdminController = class CommissionAdminController {
    db;
    commissions;
    audit;
    constructor(db, commissions, audit) {
        this.db = db;
        this.commissions = commissions;
        this.audit = audit;
    }
    async storeCommission(storeId) {
        const id = uuid(storeId);
        const [store] = await this.db.select({ id: stores.id }).from(stores).where(eq(stores.id, id));
        if (!store)
            throw errors.notFound();
        const [effective, history] = await Promise.all([this.commissions.effectiveForStore(id), this.commissions.storeHistory(id)]);
        return { effective: { pct: effective.pctBp / 100, source: effective.source }, history: history.slice(0, 50).map(presentRate) };
    }
    async setStoreCommission(storeId, body, ctx) {
        const id = uuid(storeId);
        await this.db.transaction(async (tx) => {
            const [store] = await tx.select({ id: stores.id }).from(stores).where(eq(stores.id, id));
            if (!store)
                throw errors.notFound();
            const before = await this.commissions.effectiveForStore(id);
            await this.commissions.setStoreRate(id, { pctBp: body.pct === null ? null : pctToBp(body.pct), startsAt: body.startsAt ? new Date(body.startsAt) : undefined, endsAt: body.endsAt ? new Date(body.endsAt) : null, reason: body.reason }, ctx.principal?.userId ?? null, tx);
            await this.audit.record(tx, ctx, { action: 'commission.store.set', targetType: 'store', targetId: id, before: { pctBp: before.pctBp, source: before.source }, after: { pct: body.pct, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null }, reason: body.reason });
        });
        return this.storeCommission(id);
    }
    async categoryCommission(categoryId) {
        const id = uuid(categoryId);
        const [category] = await this.db.select({ id: categories.id }).from(categories).where(eq(categories.id, id));
        if (!category)
            throw errors.notFound();
        const history = await this.commissions.categoryHistory(id);
        return { history: history.slice(0, 50).map(presentRate) };
    }
    async setCategoryCommission(categoryId, body, ctx) {
        const id = uuid(categoryId);
        await this.db.transaction(async (tx) => {
            const [category] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, id));
            if (!category)
                throw errors.notFound();
            await this.commissions.setCategoryRate(id, { pctBp: body.pct === null ? null : pctToBp(body.pct), startsAt: body.startsAt ? new Date(body.startsAt) : undefined, endsAt: body.endsAt ? new Date(body.endsAt) : null, reason: body.reason }, ctx.principal?.userId ?? null, tx);
            await this.audit.record(tx, ctx, { action: 'commission.category.set', targetType: 'category', targetId: id, after: { pct: body.pct, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null }, reason: body.reason });
        });
        return this.categoryCommission(id);
    }
};
__decorate([
    AdminOnly('commissions:read'),
    Get('stores/:storeId/commission'),
    __param(0, Param('storeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CommissionAdminController.prototype, "storeCommission", null);
__decorate([
    AdminOnly('commissions:write'),
    HttpCode(200),
    Put('stores/:storeId/commission'),
    __param(0, Param('storeId')),
    __param(1, Body(new ZodPipe(rateSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], CommissionAdminController.prototype, "setStoreCommission", null);
__decorate([
    AdminOnly('commissions:read'),
    Get('categories/:categoryId/commission'),
    __param(0, Param('categoryId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CommissionAdminController.prototype, "categoryCommission", null);
__decorate([
    AdminOnly('commissions:write'),
    HttpCode(200),
    Put('categories/:categoryId/commission'),
    __param(0, Param('categoryId')),
    __param(1, Body(new ZodPipe(rateSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], CommissionAdminController.prototype, "setCategoryCommission", null);
CommissionAdminController = __decorate([
    Controller('v1/admin'),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, CommissionService,
        AuditService])
], CommissionAdminController);
export { CommissionAdminController };
//# sourceMappingURL=finance.controllers.js.map