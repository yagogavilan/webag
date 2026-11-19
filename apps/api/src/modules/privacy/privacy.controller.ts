import { Body, Controller, Get, Header, HttpCode, Param, Post, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, Public, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { emailSchema, passwordSchema } from '../identity/index.js';
import type { Env } from '../../platform/config/env.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { DataExportService } from './data-export.service.js';

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

const exportSchema = z.strictObject({ password: passwordSchema });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** WB-212: exportar meus dados (assíncrono, com senha). */
@Controller('v1/me/data-exports')
export class DataExportController {
  constructor(
    private readonly exports: DataExportService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  latest(@CurrentPrincipal() principal: Principal) {
    return this.exports.latest(principal.userId);
  }

  /** 202: o arquivo é montado em segundo plano e o e-mail avisa. 409 `EXPORT_IN_PROGRESS`, 429 `EXPORT_DAILY_LIMIT`, 403 `EMAIL_VERIFICATION_REQUIRED` / `INVALID_PASSWORD`. */
  @Post()
  @HttpCode(202)
  @RateLimit({ name: 'data-export', limit: 10, windowSeconds: 3600 })
  request(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Body(new ZodPipe(exportSchema)) body: z.infer<typeof exportSchema>) {
    return this.exports.request(principal, body.password, ctx);
  }

  /** Link de uso único e curta duração para baixar o arquivo (só o dono; outro usuário recebe 404). */
  @Post(':exportId/download-link')
  @HttpCode(200)
  @RateLimit({ name: 'data-export-link', limit: 20, windowSeconds: 3600 })
  async link(@CurrentPrincipal() principal: Principal, @Param('exportId') exportId: string) {
    if (!UUID.test(exportId)) throw errors.notFound('Exportação não encontrada.');
    const link = await this.exports.createDownloadLink(principal.userId, exportId);
    return { url: `${this.config.get('API_PUBLIC_URL', { infer: true }).replace(/\/$/, '')}${link.url}`, expiresAt: link.expiresAt };
  }
}

@Controller('v1/data-exports')
export class DataExportDownloadController {
  constructor(private readonly exports: DataExportService) {}

  /** O token do link é a credencial: uso único, vence em `exportacao_link_min`. Falha de qualquer tipo: 410 `EXPORT_LINK_INVALID`. */
  @Public()
  @Get('download/:token')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ name: 'data-export-download', limit: 30, windowSeconds: 3600 })
  async download(@Param('token') token: string): Promise<StreamableFile> {
    const { body, fileName } = await this.exports.redeem(token);
    return new StreamableFile(body, { type: 'application/json; charset=utf-8', disposition: `attachment; filename="${fileName}"` });
  }
}
