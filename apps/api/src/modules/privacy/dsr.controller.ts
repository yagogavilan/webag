import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, Public, RequireReauth, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { emailSchema } from '../identity/index.js';
import { DSR_STATUSES, DSR_TYPES } from './db/schema.js';
import { DsrService } from './dsr.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound('Pedido não encontrado.');
  return value;
};

const submitSchema = z.strictObject({ type: z.enum(DSR_TYPES), email: emailSchema, message: z.string().trim().max(1000).optional() });
const registerSchema = z.strictObject({ type: z.enum(DSR_TYPES), email: emailSchema, message: z.string().trim().max(1000).optional(), receivedAt: z.coerce.date().optional() });
const listSchema = z.strictObject({
  status: z.enum(DSR_STATUSES).optional(),
  overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
const revealSchema = z.strictObject({ reason: z.string().trim().min(10).max(300) });
const answerSchema = z.strictObject({ answer: z.string().trim().min(5).max(1000) });

/** WB-217 C5: formulário público do titular (app e web), sem login e com resposta igual exista ou não conta. */
@Controller('v1/privacy/requests')
export class PrivacyRequestPublicController {
  constructor(private readonly dsr: DsrService) {}

  @Public()
  @Post()
  @HttpCode(202)
  @RateLimit({ name: 'privacy-request', limit: 5, windowSeconds: 3600 })
  submit(@Ctx() ctx: RequestContext, @Body(new ZodPipe(submitSchema)) body: z.infer<typeof submitSchema>) {
    return this.dsr.submit(body, ctx);
  }
}

/** WB-217 C2/C3 e OP3: fila de pedidos de titulares. Só super admin. */
@Controller('v1/admin/privacy-requests')
export class AdminPrivacyRequestsController {
  constructor(private readonly dsr: DsrService) {}

  @AdminOnly('privacy:manage')
  @Get()
  list(@Query(new ZodPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.dsr.list(query);
  }

  /** Registro manual de pedido recebido por e-mail do encarregado. */
  @AdminOnly('privacy:manage')
  @Post()
  register(@Ctx() ctx: RequestContext, @Body(new ZodPipe(registerSchema)) body: z.infer<typeof registerSchema>) {
    return this.dsr.register(ctx, body);
  }

  @AdminOnly('privacy:manage')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.dsr.get(uuid(id));
  }

  @AdminOnly('privacy:manage')
  @RequireReauth()
  @Post(':id/reveal')
  @HttpCode(200)
  reveal(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(revealSchema)) body: z.infer<typeof revealSchema>) {
    return this.dsr.reveal(ctx, uuid(id), body.reason);
  }

  @AdminOnly('privacy:manage')
  @Post(':id/in-progress')
  @HttpCode(200)
  progress(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.dsr.progress(ctx, uuid(id));
  }

  @AdminOnly('privacy:manage')
  @Post(':id/answer')
  @HttpCode(200)
  answer(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(answerSchema)) body: z.infer<typeof answerSchema>) {
    return this.dsr.answer(ctx, uuid(id), body.answer);
  }
}
