import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { limitQuery } from '../../platform/http/pagination.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { STORE_HISTORY_TYPES } from '../admin/index.js';
import { uuidParam } from '../stores/index.js';
import { StoreOverviewService } from './store-overview.service.js';

const historyQuery = z.strictObject({
  type: z.enum(STORE_HISTORY_TYPES).optional(),
  actorAdminId: z.uuid().optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  cursor: z.string().max(300).optional(),
  limit: limitQuery,
});

/** Ficha 360 da loja no admin (WB-350): `stores:read` (os 4 perfis; suporte vê sem editar, a escrita é de outras rotas). Sem documento nem dado de cliente. */
@Controller('v1/admin/stores')
export class StoreOverviewController {
  constructor(private readonly overview: StoreOverviewService) {}

  @AdminOnly('stores:read')
  @Get(':storeId/overview')
  get(@Param('storeId') storeId: string) {
    return this.overview.overview(uuidParam(storeId));
  }

  /** DEC-131: leitura da configuração para o editor `config/{section}` (substitui a seção inteira). Mesma lista permitida da visão "Ver como". */
  @AdminOnly('stores:read')
  @Get(':storeId/settings')
  operatorSettings(@Param('storeId') storeId: string) {
    return this.overview.operatorSettings(uuidParam(storeId));
  }

  @AdminOnly('stores:read')
  @Get(':storeId/history')
  history(@Param('storeId') storeId: string, @Query(new ZodPipe(historyQuery)) query: z.infer<typeof historyQuery>) {
    if (!storeId) throw errors.notFound();
    return this.overview.history(uuidParam(storeId), query);
  }
}
