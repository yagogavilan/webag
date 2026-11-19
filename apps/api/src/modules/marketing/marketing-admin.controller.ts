import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { HighlightsService } from './highlights.service.js';
import { PlatformCouponsService } from './platform-coupons.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};
const date = z.iso.datetime().transform((v) => new Date(v));

const couponCreate = z.strictObject({
  code: z.string().trim().toUpperCase().min(4).max(20),
  kind: z.enum(['percent', 'fixed', 'free_shipping']),
  value: z.number().int().min(0).max(10_000_000).default(0),
  percentCapCents: z.number().int().min(1).nullish(),
  minOrderCents: z.number().int().min(0).default(0),
  startsAt: date,
  endsAt: date,
  maxUses: z.number().int().min(1).nullish(),
  perCustomerLimit: z.number().int().min(1).max(100).default(1),
  firstPurchaseOnly: z.boolean().default(false),
});
const couponPatch = z.strictObject({
  value: z.number().int().min(0).max(10_000_000).optional(),
  percentCapCents: z.number().int().min(1).nullable().optional(),
  minOrderCents: z.number().int().min(0).optional(),
  endsAt: date.optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(100).optional(),
  firstPurchaseOnly: z.boolean().optional(),
  active: z.boolean().optional(),
});
const couponList = z.strictObject({ status: z.enum(['scheduled', 'live', 'paused', 'ended', 'exhausted']).optional(), q: z.string().trim().min(1).max(20).optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });

/** WB-116: cupons da plataforma (custo da Webag). */
@Controller('v1/admin/coupons')
export class AdminCouponsController {
  constructor(private readonly coupons: PlatformCouponsService) {}

  @AdminOnly('coupons:read')
  @Get()
  list(@Query(new ZodPipe(couponList)) query: z.infer<typeof couponList>) {
    return this.coupons.list(query);
  }

  @AdminOnly('coupons:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.coupons.get(idParam(id));
  }

  @AdminOnly('coupons:write')
  @Post()
  @RateLimit({ name: 'admin-coupon-write', limit: 60, windowSeconds: 3600 })
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(couponCreate)) body: z.infer<typeof couponCreate>) {
    return this.coupons.create(ctx, body);
  }

  @AdminOnly('coupons:write')
  @Patch(':id')
  @RateLimit({ name: 'admin-coupon-write', limit: 60, windowSeconds: 3600 })
  update(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(couponPatch)) body: z.infer<typeof couponPatch>) {
    return this.coupons.update(ctx, idParam(id), body);
  }
}

const highlightCreate = z.strictObject({
  kind: z.enum(['store', 'product']),
  targetId: z.uuid(),
  cityId: z.uuid().nullish(),
  startsAt: date,
  endsAt: date,
  position: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});
const highlightPatch = z.strictObject({ cityId: z.uuid().nullable().optional(), startsAt: date.optional(), endsAt: date.optional(), position: z.number().int().min(0).max(999).optional(), active: z.boolean().optional() });

/** WB-115 C4: destaques fixados na Início. Mesmas permissões dos banners (`banners:*`). */
@Controller('v1/admin/highlights')
export class AdminHighlightsController {
  constructor(private readonly highlights: HighlightsService) {}

  @AdminOnly('banners:read')
  @Get()
  list() {
    return this.highlights.list();
  }

  @AdminOnly('banners:write')
  @Post()
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(highlightCreate)) body: z.infer<typeof highlightCreate>) {
    return this.highlights.create(ctx, body);
  }

  @AdminOnly('banners:write')
  @Patch(':id')
  update(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(highlightPatch)) body: z.infer<typeof highlightPatch>) {
    return this.highlights.update(ctx, idParam(id), body);
  }

  @AdminOnly('banners:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Ctx() ctx: RequestContext, @Param('id') id: string): Promise<void> {
    await this.highlights.remove(ctx, idParam(id));
  }
}
