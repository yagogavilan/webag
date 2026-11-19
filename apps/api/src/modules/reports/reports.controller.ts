import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminOnly, Ctx, type RequestContext } from '../../platform/auth/decorators.js';
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
}
