import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, type RequestContext } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { LogisticsAvailabilityService } from './logistics-availability.service.js';

const pauseBody = z.strictObject({ cityId: z.uuid().nullable().optional(), reason: z.string().trim().min(3).max(200) });
const resumeBody = z.strictObject({ cityId: z.uuid().nullable().optional() });

/** Horário e pausa da logística (BUG-016, DEC-039c): o admin pausa por cidade ou geral, com motivo, e libera. */
@Controller('v1/admin/logistics')
export class LogisticsAvailabilityController {
  constructor(private readonly availability: LogisticsAvailabilityService) {}

  @AdminOnly('logistics:read')
  @Get('availability')
  async get() {
    const [now, pauses] = await Promise.all([this.availability.status(null), this.availability.listPauses()]);
    return {
      open: now.open,
      closedBy: now.closedBy,
      opensAt: now.opensAt?.toISOString() ?? null,
      pauses: pauses.map((p) => ({ id: p.id, cityId: p.cityId, reason: p.reason, pausedAt: p.pausedAt.toISOString() })),
    };
  }

  @AdminOnly('logistics:write')
  @HttpCode(200)
  @Post('pause')
  async pause(@Body(new ZodPipe(pauseBody)) body: z.infer<typeof pauseBody>, @Ctx() ctx: RequestContext) {
    const row = await this.availability.pause(body, ctx);
    return { id: row.id, cityId: row.cityId, reason: row.reason, pausedAt: row.pausedAt.toISOString() };
  }

  @AdminOnly('logistics:write')
  @HttpCode(204)
  @Post('resume')
  async resume(@Body(new ZodPipe(resumeBody)) body: z.infer<typeof resumeBody>, @Ctx() ctx: RequestContext): Promise<void> {
    await this.availability.resume(body, ctx);
  }
}
