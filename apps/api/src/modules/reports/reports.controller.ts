import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { adminHasPermission } from '../../platform/auth/permissions.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AuditService } from '../admin/index.js';
import { ReportsService } from './reports.service.js';

const ORDER_STATUSES = ['received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'cancelled', 'refused'] as const;
const base = {
  from: z.iso.date(),
  to: z.iso.date(),
  cityId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
};
const filters = z.strictObject(base);
const listQuery = z.strictObject({ ...base, status: z.enum(ORDER_STATUSES).optional(), cursor: z.string().max(300).optional(), limit: z.string().max(4).optional() });
const financeQuery = z.strictObject({ from: z.iso.date(), to: z.iso.date(), cityId: z.uuid().optional(), storeId: z.uuid().optional() });
const csvQuery = z.strictObject({ ...base, status: z.enum(ORDER_STATUSES).optional() });

/** WB-122: relatórios operacionais (super admin, operação e financeiro; suporte não vê). */
@Controller('v1/admin/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @AdminOnly('reports:operations')
  @Get('operations')
  operations(@Query(new ZodPipe(filters)) query: z.infer<typeof filters>) {
    return this.reports.operations(query);
  }

  /** CSV dos indicadores do período; a exportação é auditada (C2). */
  @AdminOnly('reports:operations')
  @RateLimit({ name: 'admin-report-export', limit: 30, windowSeconds: 3600 })
  @Get('operations.csv')
  async operationsCsv(@Query(new ZodPipe(filters)) query: z.infer<typeof filters>, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response): Promise<string> {
    const csv = await this.reports.operationsCsv(query);
    await this.audit.recordStandalone(ctx, { action: 'report.export', targetType: 'report', targetId: 'operations', after: { ...query } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-operacao-${query.from}-${query.to}.csv"`);
    return csv;
  }

  /** "Ver os N pedidos deste filtro" (C4): os mesmos filtros, paginado; os totais do relatório conferem com esta lista. */
  @AdminOnly('reports:operations')
  @Get('orders')
  orders(@Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return this.reports.orders(query);
  }

  @AdminOnly('reports:operations')
  @RateLimit({ name: 'admin-report-export', limit: 30, windowSeconds: 3600 })
  @Get('orders.csv')
  async ordersCsv(@Query(new ZodPipe(csvQuery)) query: z.infer<typeof csvQuery>, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv, rows } = await this.reports.ordersCsv(query);
    await this.audit.recordStandalone(ctx, { action: 'report.export', targetType: 'report', targetId: 'orders', after: { ...query, rows } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pedidos-${query.from}-${query.to}.csv"`);
    return csv;
  }

  /** R1 "Receita por pedido" (DT-060, DEC-060): financeiro e super admin; até 10.000 linhas (acima, 422 `EXPORT_TOO_LARGE`); auditado (WB-114 C4). */
  @AdminOnly('reports:finance')
  @RateLimit({ name: 'admin-report-export', limit: 30, windowSeconds: 3600 })
  @Get('finance/revenue.csv')
  async revenueCsv(@Query(new ZodPipe(financeQuery)) query: z.infer<typeof financeQuery>, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv, rows } = await this.reports.revenueCsv(query);
    await this.audit.recordStandalone(ctx, { action: 'report.export', targetType: 'report', targetId: 'finance_revenue', after: { ...query, rows } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="receita-por-pedido-${query.from}-${query.to}.csv"`);
    return csv;
  }

  /** R2 "Estornos" (DT-060, DEC-060): uma linha por estorno com motivo e ator. */
  @AdminOnly('reports:finance')
  @RateLimit({ name: 'admin-report-export', limit: 30, windowSeconds: 3600 })
  @Get('finance/refunds.csv')
  async refundsCsv(@Query(new ZodPipe(financeQuery)) query: z.infer<typeof financeQuery>, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv, rows } = await this.reports.refundsCsv(query);
    await this.audit.recordStandalone(ctx, { action: 'report.export', targetType: 'report', targetId: 'finance_refunds', after: { ...query, rows } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="estornos-${query.from}-${query.to}.csv"`);
    return csv;
  }
}

/** W.7 (WB-125): pendências do Início do admin. */
@Controller('v1/admin/overview')
export class AdminOverviewController {
  constructor(private readonly reports: ReportsService) {}

  @AdminOnly('overview:read')
  @Get('pending')
  pending(@CurrentPrincipal() principal: Principal) {
    const profile = principal.adminProfile;
    const can = (permission: Parameters<typeof adminHasPermission>[1]) => profile !== null && adminHasPermission(profile, permission);
    return this.reports.pendingCounts({ stores: can('stores:read'), disputes: can('exchanges:mediate'), refunds: can('payments:refunds:read'), dataRequests: can('privacy:manage') });
  }
}
