import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, Public, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { CardIntentService } from './card-intent.service.js';
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
const intentSchema = z.strictObject({
  mode: z.enum(['delivery', 'pickup']),
  addressId: z.uuid().optional(),
  cartRevision: z.number().int().min(0),
  expectedTotalCents: z.number().int().min(0),
  payerDocument: z.string().regex(/^\d{11}$/).optional(),
});
const intentPaySchema = z.strictObject({
  card: z.strictObject({ token: z.string().min(8).max(200), installments: z.number().int().min(1).max(3), paymentMethodId: z.string().max(40).optional(), issuerId: z.string().max(40).optional() }),
});
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

  /** B.1 "Não recebi meu pedido": avisa a operação (alerta + auditoria). 409 `ORDER_NOT_REPORTABLE` fora da janela; repetir é idempotente. */
  @HttpCode(202)
  @RateLimit({ name: 'order-not-received', limit: 10, windowSeconds: 3600 })
  @Post(':orderId/not-received')
  reportNotReceived(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('orderId') orderId: string) {
    return this.orders.reportNotReceived(principal, orderIdParam(orderId), ctx);
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

/** B.2: intenção de cartão para a página segura do Mercado Pago (o app nunca toca em dado de cartão). */
@Controller('v1')
export class CardIntentController {
  constructor(private readonly intents: CardIntentService) {}

  /** O app pede a intenção (o que vai comprar e o total que viu) e abre `url` no navegador do sistema. Uso único, 15 min. */
  @RateLimit({ name: 'card-intent-create', limit: 20, windowSeconds: 3600 })
  @Post('card-intents')
  create(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(intentSchema)) body: z.infer<typeof intentSchema>) {
    return this.intents.create(principal, body);
  }

  /** Página segura (sem login: a credencial é o token): valor e provedor para montar o formulário do MP. */
  @Public()
  @RateLimit({ name: 'card-intent-view', limit: 60, windowSeconds: 3600 })
  @Get('card-intents/:token')
  view(@Param('token') token: string) {
    return this.intents.view(token);
  }

  /** Página segura: manda o token do cartão (gerado no navegador pelo MP.js). Consome a intenção e cria o pedido. */
  @Public()
  @HttpCode(200)
  @RateLimit({ name: 'card-intent-pay', limit: 20, windowSeconds: 3600 })
  @Post('card-intents/:token/pay')
  pay(@Param('token') token: string, @Body(new ZodPipe(intentPaySchema)) body: z.infer<typeof intentPaySchema>) {
    return this.intents.complete(token, body.card);
  }
}
