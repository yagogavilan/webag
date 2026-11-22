import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import type { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { adminBulkSchema } from './catalog.schemas.js';

/**
 * Catálogo da loja pelo admin (WB-353, ADR-018 D15: controller do admin no módulo `catalog`, reusando os serviços do catálogo). Hoje só a ação em massa (R1.3);
 * as demais rotas de produto do admin (`x-planned`) seguem no contrato. Perfis com `store-catalog:write`: super admin e operação (financeiro e suporte: 403).
 */
@Controller('v1/admin/stores/:storeId/products')
export class AdminCatalogController {
  constructor(private readonly adminCatalog: AdminCatalogService) {}

  /** `dryRun` devolve a prévia (com a `version` de cada item) e não exige chave; sem `dryRun`, `Idempotency-Key` e `expectedVersions` são obrigatórios. Limite de 10 execuções por hora por admin. */
  @AdminOnly('store-catalog:write')
  @RateLimit({ name: 'admin-store-bulk', limit: 120, windowSeconds: 3600 })
  @HttpCode(200)
  @Post('bulk')
  bulk(
    @CurrentPrincipal() admin: Principal,
    @Ctx() ctx: RequestContext,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(adminBulkSchema)) body: z.infer<typeof adminBulkSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.adminCatalog.bulk(admin, ctx, uuidParam(storeId), body, idempotencyKey);
  }
}
