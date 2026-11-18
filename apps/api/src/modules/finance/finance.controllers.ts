import { Body, Controller, Get, HttpCode, Param, Put } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, type RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { AuditService } from '../admin/index.js';
import { categories } from '../admin/db/schema.js';
import { stores } from '../stores/db/schema.js';
import { CommissionService } from './commission.service.js';
import { pctToBp } from './domain/money.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};

/** `pct` em % com até 2 casas (8,5 = 8,50%); `null` remove o override (volta à regra seguinte). */
const rateSchema = z.strictObject({
  pct: z.number().min(0).max(30).multipleOf(0.01).nullable(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  reason: z.string().trim().min(3).max(300),
});

type RateRow = { id: string; pctBp: number | null; startsAt: Date; endsAt: Date | null; reason: string; createdAt: Date };
const presentRate = (row: RateRow) => ({
  id: row.id,
  pct: row.pctBp === null ? null : row.pctBp / 100,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt?.toISOString() ?? null,
  reason: row.reason,
  createdAt: row.createdAt.toISOString(),
});

/** WB-105 / WB-111: comissão por loja e por categoria. Financeiro e super admin; toda mudança é auditada com motivo (C3). */
@Controller('v1/admin')
export class CommissionAdminController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly commissions: CommissionService,
    private readonly audit: AuditService,
  ) {}

  @AdminOnly('commissions:read')
  @Get('stores/:storeId/commission')
  async storeCommission(@Param('storeId') storeId: string) {
    const id = uuid(storeId);
    const [store] = await this.db.select({ id: stores.id }).from(stores).where(eq(stores.id, id));
    if (!store) throw errors.notFound();
    const [effective, history] = await Promise.all([this.commissions.effectiveForStore(id), this.commissions.storeHistory(id)]);
    return { effective: { pct: effective.pctBp / 100, source: effective.source }, history: history.slice(0, 50).map(presentRate) };
  }

  @AdminOnly('commissions:write')
  @HttpCode(200)
  @Put('stores/:storeId/commission')
  async setStoreCommission(@Param('storeId') storeId: string, @Body(new ZodPipe(rateSchema)) body: z.infer<typeof rateSchema>, @Ctx() ctx: RequestContext) {
    const id = uuid(storeId);
    await this.db.transaction(async (tx) => {
      const [store] = await tx.select({ id: stores.id }).from(stores).where(eq(stores.id, id));
      if (!store) throw errors.notFound();
      const before = await this.commissions.effectiveForStore(id);
      await this.commissions.setStoreRate(id, { pctBp: body.pct === null ? null : pctToBp(body.pct), startsAt: body.startsAt ? new Date(body.startsAt) : undefined, endsAt: body.endsAt ? new Date(body.endsAt) : null, reason: body.reason }, ctx.principal?.userId ?? null, tx);
      await this.audit.record(tx, ctx, { action: 'commission.store.set', targetType: 'store', targetId: id, before: { pctBp: before.pctBp, source: before.source }, after: { pct: body.pct, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null }, reason: body.reason });
    });
    return this.storeCommission(id);
  }

  @AdminOnly('commissions:read')
  @Get('categories/:categoryId/commission')
  async categoryCommission(@Param('categoryId') categoryId: string) {
    const id = uuid(categoryId);
    const [category] = await this.db.select({ id: categories.id }).from(categories).where(eq(categories.id, id));
    if (!category) throw errors.notFound();
    const history = await this.commissions.categoryHistory(id);
    return { history: history.slice(0, 50).map(presentRate) };
  }

  @AdminOnly('commissions:write')
  @HttpCode(200)
  @Put('categories/:categoryId/commission')
  async setCategoryCommission(@Param('categoryId') categoryId: string, @Body(new ZodPipe(rateSchema)) body: z.infer<typeof rateSchema>, @Ctx() ctx: RequestContext) {
    const id = uuid(categoryId);
    await this.db.transaction(async (tx) => {
      const [category] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, id));
      if (!category) throw errors.notFound();
      await this.commissions.setCategoryRate(id, { pctBp: body.pct === null ? null : pctToBp(body.pct), startsAt: body.startsAt ? new Date(body.startsAt) : undefined, endsAt: body.endsAt ? new Date(body.endsAt) : null, reason: body.reason }, ctx.principal?.userId ?? null, tx);
      await this.audit.record(tx, ctx, { action: 'commission.category.set', targetType: 'category', targetId: id, after: { pct: body.pct, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null }, reason: body.reason });
    });
    return this.categoryCommission(id);
  }
}
