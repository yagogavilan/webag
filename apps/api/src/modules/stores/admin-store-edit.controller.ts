import { Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Body } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, StorePermission, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { limitQuery } from '../../platform/http/pagination.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AdminStoreEditService } from './admin-store-edit.service.js';
import { uuidParam } from './stores.controllers.js';

const EDIT = { name: 'admin-store-edit', limit: 120, windowSeconds: 3600 };
const feedQuery = z.strictObject({ cursor: z.string().max(300).optional(), limit: limitQuery });

/**
 * WB-351: o admin edita dados, horário, pausa e reabertura da loja, sempre com motivo, versão e auditoria (ADR-018 D6). Substituem as duas rotas legadas
 * (`PATCH /v1/admin/stores/:storeId` e `PUT .../settings/:section`), removidas. Financeiro e suporte: 403 (`stores:write`, RN-13).
 */
@Controller('v1/admin/stores')
export class AdminStoreEditController {
  constructor(private readonly edits: AdminStoreEditService) {}

  @AdminOnly('stores:write')
  @RateLimit(EDIT)
  @Patch(':storeId/profile')
  profile(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body() body: unknown) {
    return this.edits.editProfile(admin, ctx, uuidParam(storeId), body);
  }

  @AdminOnly('stores:write')
  @RateLimit(EDIT)
  @Put(':storeId/config/:section')
  config(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Param('section') section: string, @Body() body: unknown) {
    return this.edits.editConfig(admin, ctx, uuidParam(storeId), section, body);
  }

  @AdminOnly('stores:write')
  @HttpCode(200)
  @RateLimit(EDIT)
  @Post(':storeId/pause')
  pause(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body() body: unknown) {
    return this.edits.pause(admin, ctx, uuidParam(storeId), body);
  }

  @AdminOnly('stores:write')
  @HttpCode(200)
  @RateLimit(EDIT)
  @Post(':storeId/resume')
  resume(@CurrentPrincipal() admin: Principal, @Ctx() ctx: RequestContext, @Param('storeId') storeId: string, @Body() body: unknown) {
    return this.edits.resume(admin, ctx, uuidParam(storeId), body);
  }
}

/** O que a Webag alterou na loja, no painel do lojista (autor sempre "Webag"). Dono ou funcionário com `catalog`; os demais 404 (SEC-020). */
@Controller('v1/stores/:storeId/admin-changes')
export class StoreAdminChangesController {
  constructor(private readonly edits: AdminStoreEditService) {}

  @StorePermission('catalog')
  @Get()
  list(@Param('storeId') storeId: string, @Query(new ZodPipe(feedQuery)) query: z.infer<typeof feedQuery>) {
    return this.edits.listForMerchant(uuidParam(storeId), query);
  }
}
