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
import { Controller, Get, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AuditService } from '../admin/index.js';
import { ReportsService } from './reports.service.js';
const ORDER_STATUSES = ['received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'cancelled', 'refused'];
const base = {
    from: z.iso.date(),
    to: z.iso.date(),
    cityId: z.uuid().optional(),
    storeId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
};
const filters = z.strictObject(base);
const listQuery = z.strictObject({ ...base, status: z.enum(ORDER_STATUSES).optional(), cursor: z.string().max(300).optional(), limit: z.string().max(4).optional() });
const csvQuery = z.strictObject({ ...base, status: z.enum(ORDER_STATUSES).optional() });
/** WB-122: relatórios operacionais (super admin, operação e financeiro; suporte não vê). */
let ReportsController = class ReportsController {
    reports;
    audit;
    constructor(reports, audit) {
        this.reports = reports;
        this.audit = audit;
    }
    operations(query) {
        return this.reports.operations(query);
    }
    /** CSV dos indicadores do período; a exportação é auditada (C2). */
    async operationsCsv(query, ctx, res) {
        const csv = await this.reports.operationsCsv(query);
        await this.audit.recordStandalone(ctx, { action: 'report.export', targetType: 'report', targetId: 'operations', after: { ...query } });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="relatorio-operacao-${query.from}-${query.to}.csv"`);
        return csv;
    }
    /** "Ver os N pedidos deste filtro" (C4): os mesmos filtros, paginado; os totais do relatório conferem com esta lista. */
    orders(query) {
        return this.reports.orders(query);
    }
    async ordersCsv(query, ctx, res) {
        const { csv, rows } = await this.reports.ordersCsv(query);
        await this.audit.recordStandalone(ctx, { action: 'report.export', targetType: 'report', targetId: 'orders', after: { ...query, rows } });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="pedidos-${query.from}-${query.to}.csv"`);
        return csv;
    }
};
__decorate([
    AdminOnly('reports:operations'),
    Get('operations'),
    __param(0, Query(new ZodPipe(filters))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "operations", null);
__decorate([
    AdminOnly('reports:operations'),
    RateLimit({ name: 'admin-report-export', limit: 30, windowSeconds: 3600 }),
    Get('operations.csv'),
    __param(0, Query(new ZodPipe(filters))),
    __param(1, Ctx()),
    __param(2, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "operationsCsv", null);
__decorate([
    AdminOnly('reports:operations'),
    Get('orders'),
    __param(0, Query(new ZodPipe(listQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "orders", null);
__decorate([
    AdminOnly('reports:operations'),
    RateLimit({ name: 'admin-report-export', limit: 30, windowSeconds: 3600 }),
    Get('orders.csv'),
    __param(0, Query(new ZodPipe(csvQuery))),
    __param(1, Ctx()),
    __param(2, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "ordersCsv", null);
ReportsController = __decorate([
    Controller('v1/admin/reports'),
    __metadata("design:paramtypes", [ReportsService,
        AuditService])
], ReportsController);
export { ReportsController };
//# sourceMappingURL=reports.controller.js.map