import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { IdempotencyService, parseIdempotencyKey } from '../idempotency/index.js';
import { CAMPAIGN_STATUSES } from './db/schema.js';
import { PushCampaignsService } from './push-campaigns.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound('Campanha não encontrada.');
  return value;
};

const segmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('city'), cityId: z.uuid() }),
  z.strictObject({ kind: z.literal('neighborhood'), neighborhoodId: z.uuid() }),
  z.strictObject({ kind: z.literal('inactive'), days: z.number().int().min(7).max(365) }),
  z.strictObject({ kind: z.literal('bought_category'), categoryId: z.uuid() }),
  z.strictObject({ kind: z.literal('new_customers'), days: z.number().int().min(1).max(90) }),
]);
const destinationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('home') }),
  z.strictObject({ type: z.literal('store'), id: z.uuid() }),
  z.strictObject({ type: z.literal('category'), id: z.uuid() }),
  z.strictObject({ type: z.literal('coupon'), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/) }),
]);
const estimateSchema = z.strictObject({ segment: segmentSchema });
const createSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(120),
  destination: destinationSchema,
  segment: segmentSchema,
  scheduleAt: z.coerce.date().optional(),
  expectedRecipients: z.number().int().min(0),
});
const listSchema = z.strictObject({ status: z.enum(CAMPAIGN_STATUSES).optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const cancelSchema = z.strictObject({ reason: z.string().trim().min(3).max(200) });

/** WB-197: push segmentado do admin (super admin e operação; financeiro e suporte não veem). */
@Controller('v1/admin/push')
export class AdminPushController {
  constructor(
    private readonly campaigns: PushCampaignsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Estimativa "Quem recebe": só entre quem aceitou receber ofertas; abaixo do mínimo a contagem exata não sai. */
  @AdminOnly('marketing:push')
  @Post('estimate')
  @HttpCode(200)
  @RateLimit({ name: 'admin-push-estimate', limit: 120, windowSeconds: 3600 })
  estimate(@Body(new ZodPipe(estimateSchema)) body: z.infer<typeof estimateSchema>) {
    return this.campaigns.estimate(body.segment);
  }

  @AdminOnly('marketing:push')
  @Get('campaigns')
  list(@Query(new ZodPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.campaigns.list(query);
  }

  @AdminOnly('marketing:push')
  @Get('campaigns/:id')
  get(@Param('id') id: string) {
    return this.campaigns.get(idParam(id));
  }

  /** Cria e agenda (ou envia na janela). `Idempotency-Key` evita campanha em dobro no duplo toque. 422 `SEGMENT_TOO_SMALL`, 409 `ESTIMATE_CHANGED`. */
  @AdminOnly('marketing:push')
  @Post('campaigns')
  @RateLimit({ name: 'admin-push-create', limit: 30, windowSeconds: 3600 })
  create(@Ctx() ctx: RequestContext, @Headers('idempotency-key') key: string | undefined, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.idempotency.run(`push-campaign:${ctx.principal?.userId ?? ''}`, parseIdempotencyKey(key), body, () => this.campaigns.create(ctx, body), { reusedStatus: 409 });
  }

  @AdminOnly('marketing:push')
  @Post('campaigns/:id/cancel')
  @HttpCode(200)
  cancel(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    return this.campaigns.cancel(ctx, idParam(id), body.reason);
  }
}

/** O app avisa que o cliente abriu a notificação da campanha (métrica "abertos"). */
@Controller('v1/me/push-campaigns')
export class PushCampaignOpenedController {
  constructor(private readonly campaigns: PushCampaignsService) {}

  @Post(':id/opened')
  @HttpCode(204)
  @RateLimit({ name: 'push-campaign-opened', limit: 60, windowSeconds: 3600 })
  async opened(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    await this.campaigns.markOpened(principal.userId, idParam(id));
  }
}
