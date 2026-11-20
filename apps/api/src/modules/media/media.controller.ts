import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { MEDIA_PURPOSES } from './db/schema.js';
import { MediaService, type MediaAsset } from './media.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createSchema = z.strictObject({
  /** Obrigatório, exceto para `banner` (admin, sem loja). */
  storeId: z.uuid().optional(),
  purpose: z.enum(MEDIA_PURPOSES),
  contentType: z.string().max(100),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024),
});

export const presentMedia = (media: MediaService, asset: MediaAsset) => ({
  id: asset.id,
  purpose: asset.purpose,
  status: asset.status,
  contentType: asset.contentType,
  sizeBytes: asset.sizeBytes,
  width: asset.width,
  height: asset.height,
  urls: media.publicVariants(asset),
  rejectionReason: asset.rejectionReason,
  createdAt: asset.createdAt.toISOString(),
});

@Controller('v1/uploads')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @RateLimit({ name: 'upload-create', limit: 60, windowSeconds: 3600 })
  @Post()
  async create(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    const created = await this.media.create(principal, body);
    return { id: created.id, upload: { url: created.upload.url, fields: created.upload.fields, expiresAt: created.upload.expiresAt.toISOString() } };
  }

  @HttpCode(200)
  @RateLimit({ name: 'upload-complete', limit: 120, windowSeconds: 3600 })
  @Post(':id/complete')
  async complete(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    if (!UUID.test(id)) throw errors.notFound();
    return presentMedia(this.media, await this.media.complete(principal, id));
  }

  @Get(':id')
  async get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    if (!UUID.test(id)) throw errors.notFound();
    return presentMedia(this.media, await this.media.get(principal, id));
  }
}
