import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentPrincipal, StorePermission, type Principal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { uuidParam } from '../stores/index.js';
import { EXCHANGE_TYPES } from './domain/eligibility.js';
import { ExchangesService } from './exchanges.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound('Recurso não encontrado.');
  return value;
};

const createSchema = z.strictObject({
  orderItemId: z.uuid(),
  type: z.enum(EXCHANGE_TYPES),
  reasonCode: z.enum(['size', 'color']).optional(),
  description: z.string().trim().max(500).optional(),
  method: z.enum(['pickup_at_home', 'drop_at_store']),
  resolution: z.enum(['replace', 'refund']).optional(),
  newVariantId: z.uuid().optional(),
  photoIds: z.array(z.uuid()).max(5).optional(),
});
const listSchema = z.strictObject({ cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const storeListSchema = listSchema.extend({ scope: z.enum(['pending', 'in_progress', 'history']).optional() });
const cancelSchema = z.strictObject({ reason: z.string().trim().max(200).optional() });
const paySchema = z
  .strictObject({
    paymentMethod: z.enum(['pix', 'card']),
    card: z.strictObject({ token: z.string().min(8).max(200), installments: z.number().int().min(1).max(3), paymentMethodId: z.string().max(40).optional(), issuerId: z.string().max(40).optional() }).optional(),
    payerDocument: z.string().regex(/^\d{11}$/).optional(),
  })
  .refine((v) => v.paymentMethod !== 'card' || v.card !== undefined, { message: 'Informe o cartão.', path: ['card'] })
  .refine((v) => v.paymentMethod !== 'pix' || v.card === undefined, { message: 'Cartão só com paymentMethod=card.', path: ['card'] });
const rejectSchema = z.strictObject({ reason: z.string().trim().min(3).max(200) });
const receiveSchema = z.strictObject({
  ok: z.boolean(),
  reason: z.string().trim().min(3).max(200).optional(),
  returnToStock: z.boolean().optional(),
  /** Troca na loja: código de 6 caracteres que o cliente mostra no balcão. */
  code: z.string().trim().min(6).max(6).optional(),
});

/** Trocas do cliente (T.2). Tudo filtra pelo `userId` do token: troca ou pedido de outra conta é 404. */
@Controller('v1')
export class ExchangesController {
  constructor(private readonly exchanges: ExchangesService) {}

  @Get('orders/:orderId/exchange-options')
  options(@CurrentPrincipal() p: Principal, @Param('orderId') orderId: string) {
    return this.exchanges.options(p.userId, idParam(orderId));
  }

  /** Escrita repetível em 3G: `Idempotency-Key` obrigatória. */
  @RateLimit({ name: 'exchange-create', limit: 20, windowSeconds: 3600 })
  @Post('orders/:orderId/exchanges')
  async create(
    @CurrentPrincipal() p: Principal,
    @Param('orderId') orderId: string,
    @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, exchange } = await this.exchanges.create(p, idParam(orderId), body, parseIdempotencyKey(key, true)!);
    res.status(created ? 201 : 200);
    return exchange;
  }

  @Get('exchanges')
  list(@CurrentPrincipal() p: Principal, @Query(new ZodPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.exchanges.listForCustomer(p.userId, query);
  }

  @Get('exchanges/:id')
  get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.exchanges.getForCustomer(p.userId, idParam(id));
  }

  @HttpCode(200)
  @RateLimit({ name: 'exchange-write', limit: 60, windowSeconds: 3600 })
  @Post('exchanges/:id/cancel')
  async cancel(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodPipe(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    await this.exchanges.cancelByCustomer(p.userId, idParam(id), body.reason ?? null);
    return this.exchanges.getForCustomer(p.userId, id);
  }

  @Get('exchanges/:id/payment')
  payment(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.exchanges.paymentForCustomer(p.userId, idParam(id));
  }

  @HttpCode(200)
  @RateLimit({ name: 'exchange-pay', limit: 20, windowSeconds: 3600 })
  @Post('exchanges/:id/payment')
  pay(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodPipe(paySchema)) body: z.infer<typeof paySchema>) {
    return this.exchanges.pay(p, idParam(id), body);
  }
}

/** Fila de trocas da loja (WB-172/173). Exige a permissão `exchanges`; troca de outra loja é 404 (IDOR). */
@Controller('v1/stores/:storeId/exchanges')
export class StoreExchangesController {
  constructor(private readonly exchanges: ExchangesService) {}

  @StorePermission('exchanges')
  @Get()
  list(@Param('storeId') storeId: string, @Query(new ZodPipe(storeListSchema)) query: z.infer<typeof storeListSchema>) {
    return this.exchanges.listForStore(uuidParam(storeId), query);
  }

  @StorePermission('exchanges')
  @Get(':id')
  get(@Param('storeId') storeId: string, @Param('id') id: string) {
    return this.exchanges.getForStore(uuidParam(storeId), idParam(id));
  }

  @StorePermission('exchanges')
  @HttpCode(200)
  @RateLimit({ name: 'store-exchange-write', limit: 600, windowSeconds: 3600 })
  @Post(':id/approve')
  async approve(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('id') id: string) {
    await this.exchanges.approve(uuidParam(storeId), idParam(id), p.userId);
    return this.exchanges.getForStore(storeId, id);
  }

  @StorePermission('exchanges')
  @HttpCode(200)
  @RateLimit({ name: 'store-exchange-write', limit: 600, windowSeconds: 3600 })
  @Post(':id/reject')
  async reject(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('id') id: string, @Body(new ZodPipe(rejectSchema)) body: z.infer<typeof rejectSchema>) {
    await this.exchanges.reject(uuidParam(storeId), idParam(id), p.userId, body.reason);
    return this.exchanges.getForStore(storeId, id);
  }

  @StorePermission('exchanges')
  @HttpCode(200)
  @RateLimit({ name: 'store-exchange-write', limit: 600, windowSeconds: 3600 })
  @Post(':id/receive')
  async receive(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('id') id: string, @Body(new ZodPipe(receiveSchema)) body: z.infer<typeof receiveSchema>) {
    await this.exchanges.receive(uuidParam(storeId), idParam(id), p.userId, body);
    return this.exchanges.getForStore(storeId, id);
  }
}
