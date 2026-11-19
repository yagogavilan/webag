import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { MY_COUPON_STATUSES, MyCouponsService } from './my-coupons.service.js';

const listQuery = z.strictObject({
  status: z.enum(MY_COUPON_STATUSES).default('available'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

@Controller('v1/me/coupons')
export class MyCouponsController {
  constructor(private readonly coupons: MyCouponsService) {}

  @RateLimit({ name: 'my-coupons', limit: 120, windowSeconds: 600 })
  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.coupons.list(principal.userId, q);
  }
}
