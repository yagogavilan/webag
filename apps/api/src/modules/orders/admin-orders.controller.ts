import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, RequireReauth, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { AdminOrdersReadService } from './admin-orders-read.service.js';
import { ORDER_STATUSES } from './domain/state.js';
import { LateDeliveryService } from './late-delivery.service.js';
import { OrdersService } from './orders.service.js';
import { limitQuery } from '../../platform/http/pagination.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const refundSchema = z.strictObject({
  amountCents: z.number().int().positive().max(100_000_000),
  reason: z.string().trim().min(10).max(300),
});

/** `status` aceita uma lista separada por vírgula ("received,accepted"). */
const statusList = z
  .string()
  .max(200)
  .transform((value) => value.split(',').map((v) => v.trim()).filter(Boolean))
  .pipe(z.array(z.enum(ORDER_STATUSES)).min(1).max(ORDER_STATUSES.length));
const listQuerySchema = z.strictObject({
  q: z.string().trim().min(2).max(100).optional(),
  status: statusList.optional(),
  mode: z.enum(['delivery', 'pickup']).optional(),
  paymentMethod: z.enum(['pix', 'card']).optional(),
  storeId: z.uuid().optional(),
  userId: z.uuid().optional(),
  city: z.string().trim().min(2).max(80).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.string().max(200).optional(),
  limit: limitQuery,
});

const cancelSchema = z.strictObject({ reason: z.string().trim().min(10).max(300), refund: z.boolean().default(true) });
const lateRespondSchema = z.strictObject({ action: z.enum(['accept', 'arrive_soon']), note: z.string().trim().max(200).optional() });
const returnSchema = z.strictObject({ reason: z.string().trim().min(10).max(300) });

/** Pedidos no admin: lista e detalhe (B5, WB-108) e as ações de intervenção (SEC-039, WB-109). */
@Controller('v1/admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly late: LateDeliveryService,
    private readonly read: AdminOrdersReadService,
  ) {}

  /** B5 / WB-108 C1: todos os pedidos, com filtros (busca por número, e-mail do cliente ou ID; estado, tipo, pagamento, loja, cidade, período). Páginas de 50. */
  @AdminOnly('orders:read')
  @RateLimit({ name: 'admin-order-search', limit: 120, windowSeconds: 60 })
  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>, @Ctx() ctx: RequestContext) {
    return this.read.list(principal, query, ctx);
  }

  /** B5 / WB-108 C2: itens, valores (RN-10), pagamento, estornos, linha do tempo, corrida, trocas e avaliação; dado pessoal mascarado. */
  @AdminOnly('orders:read')
  @Get(':orderId')
  detail(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('orderId') orderId: string) {
    if (!UUID.test(orderId)) throw errors.notFound();
    return this.read.detail(principal, ctx, orderId);
  }

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

  /** BUG-011 / RN-08: cancelamento pelo admin (motivo obrigatório, auditado), com estorno do saldo por padrão; a loja e a logística param de tratar o pedido. */
  @AdminOnly('orders:refund')
  @RequireReauth()
  @HttpCode(200)
  @RateLimit({ name: 'admin-order-cancel', limit: 60, windowSeconds: 3600 })
  @Post(':orderId/cancel')
  async cancel(@Param('orderId') orderId: string, @Body(new ZodPipe(cancelSchema)) body: z.infer<typeof cancelSchema>, @Ctx() ctx: RequestContext) {
    if (!UUID.test(orderId)) throw errors.notFound();
    const result = await this.orders.adminCancel(orderId, { reason: body.reason, refund: body.refund }, ctx);
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

  /** WB-255 C6 / RN-19 4d: a operação responde ao cancelamento por atraso com o pedido em saída (aceita ou "chego em até N min"). Sem resposta em `entrega_cancel_resposta_min`, o sistema aceita. */
  @AdminOnly('logistics:write')
  @HttpCode(200)
  @RateLimit({ name: 'admin-late-cancel-respond', limit: 120, windowSeconds: 3600 })
  @Post(':orderId/late-cancel/respond')
  async respondLateCancel(@Param('orderId') orderId: string, @Body(new ZodPipe(lateRespondSchema)) body: z.infer<typeof lateRespondSchema>, @Ctx() ctx: RequestContext) {
    if (!UUID.test(orderId)) throw errors.notFound();
    return this.late.respond(orderId, body, ctx);
  }
}
