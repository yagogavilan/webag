import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { FavoritesService } from './favorites.service.js';
import { SearchHistoryService } from './search-history.service.js';
import { limitQuery } from '../../platform/http/pagination.js';

const listQuery = z.strictObject({ kind: z.enum(['store', 'product']).optional(), cursor: z.string().max(200).optional(), limit: limitQuery });
const recordSchema = z.strictObject({ term: z.string().trim().min(2, 'Digite ao menos 2 letras.').max(80) });

/** Favoritos e histórico de buscas da conta logada (WB-019, WB-015). O dono é sempre o `userId` do token. */
@Controller('v1/me')
export class MeDiscoveryController {
  constructor(
    private readonly favorites: FavoritesService,
    private readonly history: SearchHistoryService,
  ) {}

  @Get('favorites')
  list(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.favorites.list(principal.userId, q);
  }

  @HttpCode(204)
  @RateLimit({ name: 'favorite-write', limit: 120, windowSeconds: 3600 })
  @Put('favorites/stores/:storeId')
  async addStore(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string): Promise<void> {
    await this.favorites.addStore(principal.userId, uuidParam(storeId));
  }

  @HttpCode(204)
  @Delete('favorites/stores/:storeId')
  async removeStore(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string): Promise<void> {
    await this.favorites.removeStore(principal.userId, uuidParam(storeId));
  }

  @HttpCode(204)
  @RateLimit({ name: 'favorite-write', limit: 120, windowSeconds: 3600 })
  @Put('favorites/products/:productId')
  async addProduct(@CurrentPrincipal() principal: Principal, @Param('productId') productId: string): Promise<void> {
    await this.favorites.addProduct(principal.userId, uuidParam(productId));
  }

  @HttpCode(204)
  @Delete('favorites/products/:productId')
  async removeProduct(@CurrentPrincipal() principal: Principal, @Param('productId') productId: string): Promise<void> {
    await this.favorites.removeProduct(principal.userId, uuidParam(productId));
  }

  @Get('search-history')
  async listHistory(@CurrentPrincipal() principal: Principal) {
    return { data: await this.history.list(principal.userId), nextCursor: null };
  }

  @HttpCode(204)
  @RateLimit({ name: 'search-history-write', limit: 300, windowSeconds: 3600 })
  @Post('search-history')
  async record(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(recordSchema)) body: z.infer<typeof recordSchema>): Promise<void> {
    await this.history.record(principal.userId, body.term);
  }

  @HttpCode(204)
  @Delete('search-history')
  async clear(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.history.clear(principal.userId);
  }
}
