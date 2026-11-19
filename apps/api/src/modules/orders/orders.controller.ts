import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { OrdersService } from './orders.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderIdParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound('Pedido não encontrado.');
  return value;
};

const createSchema = z
  .strictObject({
    mode: z.enum(['delivery', 'pickup']),
    addressId: z.uuid().optional(),
    cartRevision: z.number().int().min(0),
    paymentMethod: z.enum(['pix', 'card']),
    /** SEC-147: obrigatório. O total que o cliente viu; se frete ou desconto mudaram, o pedido não sai sem ele ver o novo valor. */
    expectedTotalCents: z.number().int().min(0),
    card: z
      .strictObject({
        token: z.string().min(8).max(200),
        installments: z.number().int().min(1).max(3),
        paymentMethodId: z.string().max(40).optional(),
        issuerId: z.string().max(40).optional(),
      })
      .optional(),
    payerDocument: z.string().regex(/^\d{11}$/).optional(),
  })
  .refine((v) => v.paymentMethod !== 'card' || v.card !== undefined, { message: 'Informe o cartão.', path: ['card'] })
  .refine((v) => v.paymentMethod !== 'pix' || v.card === undefined, { message: 'Cartão só com paymentMethod=card.', path: ['card'] });
const listSchema = z.strictObject({ scope: z.enum(['active', 'past']).optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const cancelSchema = z.strictObject({ reason: z.string().trim().max(200).optional() });

/** Pedidos do cliente. Tudo filtra pelo `userId` do token: pedido de outra conta é 404 (SEC-020). */
@Controller('v1/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Criar pedido é escrita cara e repetível em 3G: `Idempotency-Key` obrigatória e limite por IP. */
  @RateLimit({ name: 'order-create', limit: 30, windowSeconds: 3600 })
  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = parseIdempotencyKey(idempotencyKey, true)!;
    const { created, orderId } = await this.orders.create(principal, body, key);
    res.status(created ? 201 : 200);
    return this.orders.getForCustomer(principal.userId, orderId);
  }

  @Get()
  async list(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.orders.listForCustomer(principal.userId, query);
  }

  @Get(':orderId')
  get(@CurrentPrincipal() principal: Principal, @Param('orderId') orderId: string) {
    return this.orders.getForCustomer(principal.userId, orderIdParam(orderId));
  }

  @Get(':orderId/payment')
  payment(@CurrentPrincipal() principal: Principal, @Param('orderId') orderId: string) {
    return this.orders.paymentForCustomer(principal.userId, orderIdParam(orderId));
  }

  @HttpCode(200)
  @RateLimit({ name: 'order-cancel', limit: 30, windowSeconds: 3600 })
  @Post(':orderId/cancel')
  async cancel(@CurrentPrincipal() principal: Principal, @Param('orderId') orderId: string, @Body(new ZodPipe(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    const id = orderIdParam(orderId);
    await this.orders.cancelByCustomer(principal.userId, id, body.reason ?? null);
    return this.orders.getForCustomer(principal.userId, id);
  }
}
