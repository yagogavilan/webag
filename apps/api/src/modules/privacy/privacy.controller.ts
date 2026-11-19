import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, Public, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { emailSchema, passwordSchema } from '../identity/index.js';
import { AccountDeletionService } from './account-deletion.service.js';

const deleteAccountSchema = z.strictObject({ password: passwordSchema });
const cancelDeletionSchema = z.strictObject({ email: emailSchema, password: passwordSchema });

/** WB-213: excluir minha conta (cliente, lojista dono ou funcionário). Admin tem outro caminho (WB-101). */
@Controller('v1/me/deletion')
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @Get()
  overview(@CurrentPrincipal() principal: Principal) {
    return this.deletion.overview(principal);
  }

  /** SEC-096: só a senha. 409 `DELETION_BLOCKED` traz `blockers`; senha errada 403 `INVALID_PASSWORD` (conta no limite do login). */
  @Post()
  @HttpCode(200)
  @RateLimit({ name: 'account-deletion', limit: 10, windowSeconds: 3600 })
  request(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Body(new ZodPipe(deleteAccountSchema)) body: z.infer<typeof deleteAccountSchema>) {
    return this.deletion.request(principal, body.password, ctx);
  }
}

@Controller('v1/auth/account-deletion')
export class AccountDeletionPublicController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /** Arrependimento: e-mail e senha da conta em período de exclusão. Falha sempre responde igual ao login (401). */
  @Public()
  @Post('cancel')
  @HttpCode(204)
  @RateLimit({ name: 'account-deletion-cancel', limit: 10, windowSeconds: 3600 })
  async cancel(@Ctx() ctx: RequestContext, @Body(new ZodPipe(cancelDeletionSchema)) body: z.infer<typeof cancelDeletionSchema>): Promise<void> {
    await this.deletion.cancel(body.email, body.password, ctx);
  }
}
