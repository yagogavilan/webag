import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, Public, type RequestContext } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { BANNER_DESTINATIONS } from './db/schema.js';
import { BannersService } from './banners.service.js';

const publicQuery = z.strictObject({ cityId: z.uuid().optional() });
const date = z.iso.datetime().transform((v) => new Date(v));
const bannerShape = {
  title: z.string().trim().min(1).max(80),
  imageAssetId: z.uuid(),
  cityId: z.uuid().nullish(),
  destinationType: z.enum(BANNER_DESTINATIONS),
  destinationId: z.uuid().nullish(),
  destinationCode: z.string().trim().min(1).max(20).nullish(),
  startsAt: date,
  endsAt: date,
  position: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
};
const eventSchema = z.strictObject({ type: z.enum(['impression', 'click']) });
const createSchema = z.strictObject(bannerShape);
const updateSchema = z.strictObject(Object.fromEntries(Object.entries(bannerShape).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof bannerShape]: z.ZodOptional<(typeof bannerShape)[K]> });

@Controller('v1')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  /** Público (o app navega sem login, WB-005). Mesmo conteúdo para todos: pode ficar em cache compartilhado. */
  @Public()
  @RateLimit({ name: 'banners-public', limit: 120, windowSeconds: 60 })
  @Get('banners')
  @Header('Cache-Control', 'public, max-age=60')
  async list(@Query(new ZodPipe(publicQuery)) query: z.infer<typeof publicQuery>) {
    return { data: await this.banners.listPublic(query.cityId), nextCursor: null };
  }

  /** O app avisa a impressão e o clique do banner (WB-115 C5). Público, com limite por IP; banner fora do ar não conta. */
  @Public()
  @HttpCode(204)
  @RateLimit({ name: 'banner-event', limit: 240, windowSeconds: 60 })
  @Post('banners/:bannerId/events')
  async event(@Param('bannerId') id: string, @Body(new ZodPipe(eventSchema)) body: z.infer<typeof eventSchema>): Promise<void> {
    await this.banners.recordEvent(uuidParam(id), body.type);
  }

  @AdminOnly('banners:read')
  @Get('admin/banners')
  async listAdmin() {
    return { data: await this.banners.listAdmin(), nextCursor: null };
  }

  @AdminOnly('banners:write')
  @Post('admin/banners')
  create(@Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>, @Ctx() ctx: RequestContext) {
    return this.banners.create(body, ctx);
  }

  @AdminOnly('banners:write')
  @Patch('admin/banners/:bannerId')
  update(@Param('bannerId') id: string, @Body(new ZodPipe(updateSchema)) body: z.infer<typeof updateSchema>, @Ctx() ctx: RequestContext) {
    return this.banners.update(uuidParam(id), body, ctx);
  }

  @AdminOnly('banners:write')
  @HttpCode(204)
  @Delete('admin/banners/:bannerId')
  async remove(@Param('bannerId') id: string, @Ctx() ctx: RequestContext): Promise<void> {
    await this.banners.remove(uuidParam(id), ctx);
  }
}
