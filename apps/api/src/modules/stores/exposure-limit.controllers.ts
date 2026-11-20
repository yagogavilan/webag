import { Body, Controller, Get, HttpCode, Inject, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, StorePermission, type RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { AuditService } from '../admin/index.js';
import { ExposureLimitService } from './exposure-limit.service.js';
import type { ExposureLimit } from './exposure-limit.js';
import { uuidParam } from './stores.controllers.js';

const putSchema = z
  .strictObject({
    mode: z.enum(['default', 'released', 'custom']),
    maxOrderCents: z.number().int().min(10_000).max(5_000_000).optional(),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((v) => (v.mode === 'custom') === (v.maxOrderCents !== undefined), { message: 'Informe maxOrderCents só no modo custom', path: ['maxOrderCents'] });

export const presentExposure = (limit: ExposureLimit) => ({
  active: limit.active,
  mode: limit.mode,
  maxOrder: limit.maxOrderCents === null ? null : { amount: limit.maxOrderCents, currency: 'BRL' as const },
  endsAt: limit.endsAt?.toISOString() ?? null,
  deliveredOrders: limit.deliveredOrders,
  ordersToEnd: limit.ordersToEnd,
});

/** Lojista (qualquer membro) vê o próprio limite para o banner "Loja nova: pedidos de até R$ 500,00". */
@Controller('v1/stores/:storeId/exposure-limit')
export class StoreExposureController {
  constructor(private readonly exposure: ExposureLimitService) {}

  @StorePermission('member')
  @Get()
  async get(@Param('storeId') storeId: string) {
    return presentExposure(await this.exposure.forStore(uuidParam(storeId)));
  }
}

/** Admin libera ou ajusta o teto com motivo; toda mudança é auditada (DEC-020b). */
@Controller('v1/admin/stores/:storeId/exposure-limit')
export class AdminExposureController {
  constructor(
    private readonly exposure: ExposureLimitService,
    private readonly audit: AuditService,
    @Inject(DRIZZLE) private readonly db: Db,
  ) {}

  @AdminOnly('stores:read')
  @Get()
  async get(@Param('storeId') storeId: string) {
    return presentExposure(await this.exposure.forStore(uuidParam(storeId)));
  }

  @AdminOnly('stores:decide')
  @HttpCode(200)
  @Put()
  async put(@Param('storeId') storeId: string, @Body(new ZodPipe(putSchema)) body: z.infer<typeof putSchema>, @Ctx() ctx: RequestContext) {
    const id = uuidParam(storeId);
    const actorId = ctx.principal?.userId;
    if (!actorId) throw errors.forbidden();
    await this.db.transaction(async (tx) => {
      const { before } = await this.exposure.configure(tx, id, { mode: body.mode, maxOrderCents: body.maxOrderCents ?? null, reason: body.reason, actorId });
      await this.audit.record(tx, ctx, { action: 'store.exposure_limit.set', targetType: 'store', targetId: id, before, after: { mode: body.mode, maxOrderCents: body.maxOrderCents ?? null }, reason: body.reason });
    });
    return presentExposure(await this.exposure.forStore(id));
  }
}
