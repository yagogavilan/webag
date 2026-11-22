import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { ViewAsService } from '../identity/index.js';
import { StoresService } from './stores.service.js';
import { uuidParam } from './stores.controllers.js';

const openSchema = z.strictObject({
  reason: z.strictObject({
    code: z.enum(['merchant_support', 'investigate_issue', 'check_registration', 'other']),
    note: z.string().trim().max(200).optional(),
  }),
});

/**
 * "Ver como o lojista" (WB-352, ADR-018 D8): abrir e encerrar a visão. A credencial e a regra de acesso são de `identity` (`ViewAsService`); aqui só
 * HTTP e a conferência de que a loja existe. Não aceitam `X-View-As` (o `ViewAsGuard` responde 403 `VIEW_AS_READ_ONLY`).
 */
@Controller('v1/admin')
export class AdminViewAsController {
  constructor(
    private readonly viewAs: ViewAsService,
    private readonly stores: StoresService,
  ) {}

  @AdminOnly('view-as:open')
  @Post('stores/:storeId/view-as')
  async open(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body() body: unknown) {
    const id = uuidParam(storeId);
    const reason = (body as { reason?: { code?: unknown; note?: unknown } } | null)?.reason;
    // WB-352 C9: sem motivo é 422 (não 400); "outro" exige a nota.
    if (!reason || typeof reason !== 'object' || !reason.code || (reason.code === 'other' && !(typeof reason.note === 'string' && reason.note.trim()))) {
      throw errors.unprocessable('REASON_REQUIRED', 'Informe o motivo', { errors: [{ field: 'reason', message: 'Escolha o motivo da visualização (em "outro", escreva a nota).' }] });
    }
    const input = new ZodPipe(openSchema).transform(body);
    const store = await this.stores.getStore(id);
    const opened = await this.viewAs.open(principal, store.id, input.reason, ctx);
    return { id: opened.id, token: opened.token, storeId: opened.storeId, storeName: store.name, expiresAt: opened.expiresAt.toISOString(), reason: opened.reason };
  }

  @AdminOnly('view-as:open')
  @HttpCode(204)
  @Post('view-as/:viewAsId/end')
  async end(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Param('viewAsId') viewAsId: string): Promise<void> {
    await this.viewAs.end(principal, uuidParam(viewAsId), ctx);
  }
}
