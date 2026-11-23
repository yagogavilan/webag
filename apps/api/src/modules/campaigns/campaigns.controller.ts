import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { AdminOnly, CurrentPrincipal, Ctx, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { parseIdempotencyKey } from '../idempotency/index.js';
import { CampaignsService } from './campaigns.service.js';
import { activateBody, campaignCreate, campaignList, campaignPatch, pageQuery, reasonBody, simulationBody, suspectList } from './campaigns.schemas.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};
const WRITE = { name: 'admin-campaign-write', limit: 120, windowSeconds: 3600 };

/**
 * Admin de campanhas e cupons (WB-340, WB-342, WB-349, WB-344; ADR-019). Permissões da tabela única (`permissions.ts`): ler `coupons:read`; criar, editar rascunho, pausar, duplicar e liberar
 * "Suspeitos" `coupons:write` (super admin e operação); ativar, retomar e encerrar `coupons:activate` (super admin e financeiro, com 2º fator quando há custo da Webag). Nenhuma rota aceita
 * "Ver como" (o guard nega tudo que não tem opt-in).
 */
@Controller('v1/admin')
export class AdminCampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @AdminOnly('coupons:read')
  @Get('campaigns')
  list(@CurrentPrincipal() p: Principal, @Query(new ZodPipe(campaignList)) q: z.infer<typeof campaignList>) {
    return this.campaigns.list(p.adminProfile, q);
  }

  @AdminOnly('coupons:write')
  @Post('campaigns')
  @RateLimit(WRITE)
  create(@Ctx() ctx: RequestContext, @CurrentPrincipal() p: Principal, @Body(new ZodPipe(campaignCreate)) body: z.infer<typeof campaignCreate>, @Headers('idempotency-key') key: string | undefined) {
    return this.campaigns.create(ctx, p, body, parseIdempotencyKey(key, true)!);
  }

  @AdminOnly('coupons:read')
  @HttpCode(200)
  @Post('campaigns/simulate')
  @RateLimit({ name: 'admin-campaign-simulate', limit: 600, windowSeconds: 3600 })
  simulate(@Body(new ZodPipe(simulationBody)) body: z.infer<typeof simulationBody>) {
    return this.campaigns.simulate(body);
  }

  @AdminOnly('coupons:read')
  @Get('campaigns/:campaignId')
  get(@CurrentPrincipal() p: Principal, @Param('campaignId') id: string) {
    return this.campaigns.get(p.adminProfile, idParam(id));
  }

  @AdminOnly('coupons:write')
  @Patch('campaigns/:campaignId')
  @RateLimit(WRITE)
  update(@Ctx() ctx: RequestContext, @CurrentPrincipal() p: Principal, @Param('campaignId') id: string, @Body(new ZodPipe(campaignPatch)) body: z.infer<typeof campaignPatch>, @Headers('idempotency-key') key: string | undefined) {
    return this.campaigns.update(ctx, p, idParam(id), body, parseIdempotencyKey(key, false));
  }

  @AdminOnly('coupons:activate')
  @HttpCode(200)
  @Post('campaigns/:campaignId/activate')
  @RateLimit(WRITE)
  activate(@Ctx() ctx: RequestContext, @CurrentPrincipal() p: Principal, @Param('campaignId') id: string, @Body(new ZodPipe(activateBody)) body: z.infer<typeof activateBody>, @Headers('idempotency-key') key: string | undefined) {
    return this.campaigns.activate(ctx, p, idParam(id), body, parseIdempotencyKey(key, false));
  }

  @AdminOnly('coupons:write')
  @HttpCode(200)
  @Post('campaigns/:campaignId/pause')
  @RateLimit(WRITE)
  pause(@Ctx() ctx: RequestContext, @CurrentPrincipal() p: Principal, @Param('campaignId') id: string, @Body(new ZodPipe(reasonBody)) body: z.infer<typeof reasonBody>, @Headers('idempotency-key') key: string | undefined) {
    return this.campaigns.pause(ctx, p, idParam(id), body.reason, parseIdempotencyKey(key, false));
  }

  @AdminOnly('coupons:activate')
  @HttpCode(200)
  @Post('campaigns/:campaignId/resume')
  @RateLimit(WRITE)
  resume(@Ctx() ctx: RequestContext, @CurrentPrincipal() p: Principal, @Param('campaignId') id: string, @Body(new ZodPipe(activateBody)) body: z.infer<typeof activateBody>, @Headers('idempotency-key') key: string | undefined) {
    return this.campaigns.resume(ctx, p, idParam(id), body, parseIdempotencyKey(key, false));
  }

  @AdminOnly('coupons:activate')
  @HttpCode(200)
  @Post('campaigns/:campaignId/end')
  @RateLimit(WRITE)
  end(@Ctx() ctx: RequestContext, @CurrentPrincipal() p: Principal, @Param('campaignId') id: string, @Body(new ZodPipe(reasonBody)) body: z.infer<typeof reasonBody>, @Headers('idempotency-key') key: string | undefined) {
    return this.campaigns.end(ctx, p, idParam(id), body.reason, parseIdempotencyKey(key, false));
  }

  @AdminOnly('coupons:write')
  @Post('campaigns/:campaignId/duplicate')
  @RateLimit(WRITE)
  duplicate(@Ctx() ctx: RequestContext, @CurrentPrincipal() p: Principal, @Param('campaignId') id: string, @Body(new ZodPipe(reasonBody)) body: z.infer<typeof reasonBody>, @Headers('idempotency-key') key: string | undefined) {
    return this.campaigns.duplicate(ctx, p, idParam(id), body.reason, parseIdempotencyKey(key, true)!);
  }

  @AdminOnly('coupons:read')
  @Get('campaign-alerts')
  alerts(@Query(new ZodPipe(pageQuery)) q: z.infer<typeof pageQuery>) {
    return this.campaigns.alerts(q);
  }

  @AdminOnly('coupons:read')
  @Get('campaign-budget')
  budget() {
    return this.campaigns.globalBudget();
  }

  @AdminOnly('coupons:read')
  @Get('coupon-suspects')
  suspects(@Query(new ZodPipe(suspectList)) q: z.infer<typeof suspectList>) {
    return this.campaigns.suspects(q);
  }

  @AdminOnly('coupons:write')
  @HttpCode(200)
  @Post('coupon-suspects/:suspectId/release')
  @RateLimit(WRITE)
  releaseSuspect(@Ctx() ctx: RequestContext, @CurrentPrincipal() p: Principal, @Param('suspectId') id: string, @Body(new ZodPipe(reasonBody)) body: z.infer<typeof reasonBody>, @Headers('idempotency-key') key: string | undefined) {
    return this.campaigns.releaseSuspect(ctx, p, idParam(id), body.reason, parseIdempotencyKey(key, false));
  }
}
