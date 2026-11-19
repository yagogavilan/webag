import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, StorePermission, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { uuidParam } from '../stores/index.js';
import { EXCHANGE_STATUSES } from './db/schema.js';
import { EXCHANGE_TYPES } from './domain/eligibility.js';
import { AuditService } from '../admin/index.js';
import { ExchangesReportService } from './exchanges-report.service.js';
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
const contestSchema = z.strictObject({ text: z.string().trim().min(10).max(500) });
const mediationQuery = z.strictObject({ cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const mediationDecision = z.strictObject({ decision: z.enum(['customer', 'store']), reason: z.string().trim().min(10).max(200) });
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

  /** WB-176: contestar a recusa da loja (uma vez, até `contestacao_dias`); a troca vai à mediação. Repetir é idempotente. */
  @HttpCode(200)
  @RateLimit({ name: 'exchange-contest', limit: 10, windowSeconds: 3600 })
  @Post('exchanges/:id/contest')
  async contest(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodPipe(contestSchema)) body: z.infer<typeof contestSchema>) {
    await this.exchanges.contest(p.userId, idParam(id), body.text);
    return this.exchanges.getForCustomer(p.userId, id);
  }

  /** B.1: depois de aprovada, trocar a coleta em casa por levar o item à loja (só com a taxa ainda não paga e antes do motoboy sair). */
  @Post('exchanges/:id/drop-at-store')
  @HttpCode(200)
  @RateLimit({ name: 'exchange-switch', limit: 30, windowSeconds: 3600 })
  async dropAtStore(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    await this.exchanges.switchToStore(principal.userId, idParam(id));
    return this.exchanges.getForCustomer(principal.userId, idParam(id));
  }

  @Get('exchanges/:id/payment')
  payment(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.exchanges.paymentForCustomer(p.userId, idParam(id));
  }

  @HttpCode(200)
  @RateLimit({ name: 'exchange-pay', limit: 20, windowSeconds: 3600 })
  @Post('exchanges/:id/payment')
  pay(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body(new ZodPipe(paySchema)) body: z.infer<typeof paySchema>) {
    return this.exchanges.pay(p, idParam(id), body, parseIdempotencyKey(idempotencyKey));
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
  @Post(':id/accept')
  async approve(@CurrentPrincipal() p: Principal, @Param('storeId') storeId: string, @Param('id') id: string) {
    await this.exchanges.approve(uuidParam(storeId), idParam(id), p.userId);
    return this.exchanges.getForStore(storeId, id);
  }

  @StorePermission('exchanges')
  @HttpCode(200)
  @RateLimit({ name: 'store-exchange-write', limit: 600, windowSeconds: 3600 })
  @Post(':id/refuse')
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

const reportSchema = z
  .strictObject({
    from: z.iso.date(),
    to: z.iso.date(),
    storeId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    type: z.enum(EXCHANGE_TYPES).optional(),
    format: z.enum(['json', 'csv']).optional(),
  })
  .refine((v) => v.from <= v.to, { message: 'O início do período não pode ser depois do fim.', path: ['from'] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366, { message: 'Período de no máximo 366 dias.', path: ['to'] });

/** WB-248: relatório de trocas por loja e categoria. Operação, financeiro e super admin; custos só financeiro e super admin. */
@Controller('v1/admin/exchanges')
export class ExchangesAdminController {
  constructor(
    private readonly report: ExchangesReportService,
    private readonly audit: AuditService,
  ) {}

  @AdminOnly('exchanges:report')
  @Get('report')
  async get(@Query(new ZodPipe(reportSchema)) query: z.infer<typeof reportSchema>, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    const profile = ctx.principal?.adminProfile;
    const result = await this.report.report(query, profile === 'super_admin' || profile === 'finance');
    if (query.format === 'csv') {
      // Exportação é auditada (WB-248 C4).
      await this.audit.recordStandalone(ctx, { action: 'exchange.report.export', targetType: 'report', targetId: 'exchanges', after: { from: query.from, to: query.to, storeId: query.storeId ?? null } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="trocas-${query.from}-${query.to}.csv"`);
      return this.report.toCsv(result);
    }
    return result;
  }
}

/** Mediação de trocas (WB-110): fila por prazo e decisão com justificativa. Operação e super admin. */
@Controller('v1/admin/exchanges/mediations')
export class ExchangeMediationAdminController {
  constructor(private readonly exchanges: ExchangesService) {}

  @AdminOnly('exchanges:mediate')
  @Get()
  list(@Query(new ZodPipe(mediationQuery)) query: z.infer<typeof mediationQuery>) {
    return this.exchanges.mediationQueue(query);
  }

  /** `customer` aprova a troca (segue o fluxo, inclusive a taxa); `store` recusa em definitivo. Justificativa obrigatória; as partes são avisadas. */
  @AdminOnly('exchanges:mediate')
  @HttpCode(200)
  @RateLimit({ name: 'admin-exchange-mediation', limit: 120, windowSeconds: 3600 })
  @Post(':exchangeId/decision')
  async decide(@Param('exchangeId') exchangeId: string, @Body(new ZodPipe(mediationDecision)) body: z.infer<typeof mediationDecision>, @Ctx() ctx: RequestContext) {
    await this.exchanges.decideMediation(idParam(exchangeId), body.decision, body.reason, ctx);
    return { status: 'decided' as const };
  }
}

const adminListSchema = z.strictObject({
  status: z.enum(EXCHANGE_STATUSES).optional(),
  storeId: z.uuid().optional(),
  q: z.string().trim().min(3).max(12).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.string().max(4).optional(),
});
const waiveSchema = z.strictObject({ reason: z.string().trim().min(10).max(160) });

/** AT3/M3: lista, detalhe e isenção da taxa de coleta. Rotas próprias (`exchange-requests`) para não colidir com `exchanges/mediations`. */
@Controller('v1/admin/exchange-requests')
export class ExchangeRequestsAdminController {
  constructor(private readonly exchanges: ExchangesService) {}

  @AdminOnly('exchanges:read')
  @Get()
  list(@Query(new ZodPipe(adminListSchema)) query: z.infer<typeof adminListSchema>) {
    return this.exchanges.listForAdmin(query);
  }

  @AdminOnly('exchanges:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.exchanges.getForAdmin(idParam(id));
  }

  @AdminOnly('exchanges:waive-fee')
  @HttpCode(200)
  @RateLimit({ name: 'admin-exchange-waive-fee', limit: 60, windowSeconds: 3600 })
  @Post(':id/waive-fee')
  waive(@Param('id') id: string, @Body(new ZodPipe(waiveSchema)) body: z.infer<typeof waiveSchema>, @Ctx() ctx: RequestContext) {
    return this.exchanges.waiveFee(idParam(id), body.reason, ctx);
  }
}
