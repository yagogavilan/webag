import { Body, Controller, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { NotificationsService } from './notifications.service.js';

/** Token do Expo: `ExponentPushToken[...]` ou `ExpoPushToken[...]`. */
const token = z.string().trim().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,80}\]$/);
const registerSchema = z.strictObject({ token, platform: z.enum(['android', 'ios']) });
const revokeSchema = z.strictObject({ token });

/** Registro do aparelho para push (RF-NOT-01). Sempre da conta logada; o token é revogável por quem o registrou. */
@Controller('v1/me/push-devices')
export class PushDevicesController {
  constructor(private readonly notifications: NotificationsService) {}

  @HttpCode(204)
  @RateLimit({ name: 'push-device', limit: 60, windowSeconds: 3600 })
  @Put()
  async register(@CurrentPrincipal() p: Principal, @Body(new ZodPipe(registerSchema)) body: z.infer<typeof registerSchema>): Promise<void> {
    await this.notifications.registerDevice(p.userId, body);
  }

  @HttpCode(204)
  @RateLimit({ name: 'push-device', limit: 60, windowSeconds: 3600 })
  @Post('revoke')
  async revoke(@CurrentPrincipal() p: Principal, @Body(new ZodPipe(revokeSchema)) body: z.infer<typeof revokeSchema>): Promise<void> {
    await this.notifications.revokeDevice(p.userId, body.token);
  }
}
