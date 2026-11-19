import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, RequireReauth, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { OrdersService } from './orders.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const refundSchema = z.strictObject({
  amountCents: z.number().int().positive().max(100_000_000),
  reason: z.string().trim().min(10).max(300),
});

const returnSchema = z.strictObject({ reason: z.string().trim().min(10).max(300) });

/** Ações do admin sobre pedidos (SEC-039). A lista/detalhe de pedidos do admin entra com o painel (Onda 4D). */
@Controller('v1/admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Estorno manual total ou parcial: reautenticação, motivo, `Idempotency-Key` obrigatória e auditoria. */
  @AdminOnly('orders:refund')
  @RequireReauth()
  @HttpCode(200)
  @RateLimit({ name: 'admin-refund', limit: 60, windowSeconds: 3600 })
  @Post(':orderId/refunds')
  async refund(
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodPipe(refundSchema)) body: z.infer<typeof refundSchema>,
    @Ctx() ctx: RequestContext,
  ) {
    if (!UUID.test(orderId)) throw errors.notFound();
    const key = parseIdempotencyKey(idempotencyKey, true)!;
    const result = await this.orders.adminRefund(orderId, { amountCents: body.amountCents, reason: body.reason, idempotencyKey: key }, ctx);
    return {
      status: result.status,
      refunded: { amount: result.refundedCents, currency: 'BRL' },
      remaining: { amount: result.remainingCents, currency: 'BRL' },
    };
  }

  /** SEC-143: o admin registra que a loja recebeu a devolução (a loja não confirmou no painel); motivo obrigatório, auditado, outra pessoa que a operação que declarou a devolução. */
  @AdminOnly('logistics:write')
  @RequireReauth()
  @HttpCode(200)
  @RateLimit({ name: 'admin-store-return', limit: 60, windowSeconds: 3600 })
  @Post(':orderId/store-return')
  async storeReturn(@Param('orderId') orderId: string, @Body(new ZodPipe(returnSchema)) body: z.infer<typeof returnSchema>, @Ctx() ctx: RequestContext) {
    if (!UUID.test(orderId)) throw errors.notFound();
    await this.orders.adminConfirmStoreReturn(orderId, body.reason, ctx);
    return { status: 'cancelled' as const };
  }
}
