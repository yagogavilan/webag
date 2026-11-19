import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AccountsService } from './accounts.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const userId = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};

const searchSchema = z.strictObject({
  q: z.string().trim().min(3, 'Digite ao menos 3 caracteres.').max(100).optional(),
  role: z.enum(['customer', 'merchant']).optional(),
  status: z.enum(['active', 'blocked', 'deleted']).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.string().max(4).optional(),
});
const reasonSchema = z.strictObject({ reason: z.string().trim().min(10, 'Informe o motivo (mínimo 10 caracteres).').max(300) });

/** B4 / WB-102 (DEC-073): clientes e lojistas no admin. Dados mascarados; bloquear e desbloquear com motivo e auditoria; sem redefinir senha. */
@Controller('v1/admin/users')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @AdminOnly('users:read')
  @RateLimit({ name: 'admin-user-search', limit: 120, windowSeconds: 60 })
  @Get()
  search(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(searchSchema)) query: z.infer<typeof searchSchema>, @Ctx() ctx: RequestContext) {
    return this.accounts.search(principal, query, ctx);
  }

  @AdminOnly('users:read')
  @Get(':userId')
  detail(@CurrentPrincipal() principal: Principal, @Param('userId') id: string) {
    return this.accounts.detail(principal.adminProfile!, userId(id));
  }

  @AdminOnly('users:block')
  @HttpCode(200)
  @RateLimit({ name: 'admin-user-block', limit: 60, windowSeconds: 3600 })
  @Post(':userId/block')
  block(@CurrentPrincipal() principal: Principal, @Param('userId') id: string, @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>, @Ctx() ctx: RequestContext) {
    return this.accounts.block(principal, userId(id), body.reason, ctx);
  }

  @AdminOnly('users:block')
  @HttpCode(200)
  @RateLimit({ name: 'admin-user-unblock', limit: 60, windowSeconds: 3600 })
  @Post(':userId/unblock')
  unblock(@CurrentPrincipal() principal: Principal, @Param('userId') id: string, @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>, @Ctx() ctx: RequestContext) {
    return this.accounts.unblock(principal, userId(id), body.reason, ctx);
  }
}
