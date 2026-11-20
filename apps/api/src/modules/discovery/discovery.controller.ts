import { Controller, Get, Header, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { DiscoveryService } from './discovery.service.js';
import { geoQuery } from './geo.js';
import { limitQuery } from '../../platform/http/pagination.js';

const bool = z.enum(['true']).transform(() => true);
const money = z.coerce.number().int().min(0).max(9_999_999);
const common = {
  ...geoQuery,
  q: z.string().trim().max(80).optional(),
  categoryId: z.uuid().optional(),
  maxDistanceKm: z.coerce.number().min(0.5).max(50).optional(),
  freeShipping: bool.optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  acceptsExchange: bool.optional(),
  cursor: z.string().max(200).optional(),
  limit: limitQuery,
};
const homeQuery = z.strictObject({ ...geoQuery, mode: z.enum(['delivery', 'pickup']).default('delivery') });
const storesQuery = z.strictObject({ ...common, sort: z.enum(['relevance', 'distance', 'rating', 'fee', 'eta']).default('relevance') });
const productsQuery = z
  .strictObject({ ...common, minPriceCents: money.optional(), maxPriceCents: money.optional(), sort: z.enum(['relevance', 'price_asc', 'distance', 'rating', 'discount']).default('relevance') })
  .refine((v) => v.minPriceCents === undefined || v.maxPriceCents === undefined || v.minPriceCents <= v.maxPriceCents, { message: 'O preço mínimo não pode passar do máximo.', path: ['minPriceCents'] });
const suggestionsQuery = z.strictObject({ ...geoQuery, q: z.string().trim().max(80) });

/** Resposta de descoberta é por posição e vira lixo logo: cache curto no aparelho, nunca em cache compartilhado. */
const PRIVATE_SHORT_CACHE = 'private, max-age=30';

/**
 * Descoberta pública (WB-005: navegar sem login). A posição vem de `lat`/`lng` (o app a tem do endereço salvo, do CEP
 * ou do GPS). Rate limit por IP; as coordenadas são mascaradas no log de acesso (app.module).
 */
@Controller('v1')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Public()
  @RateLimit({ name: 'discovery', limit: 120, windowSeconds: 60 })
  @Get('home')
  @Header('Cache-Control', PRIVATE_SHORT_CACHE)
  home(@Query(new ZodPipe(homeQuery)) q: z.infer<typeof homeQuery>) {
    return this.discovery.home({ lat: q.lat, lng: q.lng }, q.mode);
  }

  @Public()
  @RateLimit({ name: 'search', limit: 90, windowSeconds: 60 })
  @Get('search/stores')
  @Header('Cache-Control', PRIVATE_SHORT_CACHE)
  searchStores(@Query(new ZodPipe(storesQuery)) q: z.infer<typeof storesQuery>) {
    if (q.q !== undefined && q.q.length > 0 && q.q.length < 2) throw errors.validation([{ field: 'q', message: 'Digite ao menos 2 letras.' }]);
    const { lat, lng, ...filters } = q;
    return this.discovery.searchStores({ lat, lng }, filters);
  }

  @Public()
  @RateLimit({ name: 'search', limit: 90, windowSeconds: 60 })
  @Get('search/products')
  @Header('Cache-Control', PRIVATE_SHORT_CACHE)
  searchProducts(@Query(new ZodPipe(productsQuery)) q: z.infer<typeof productsQuery>) {
    if (q.q !== undefined && q.q.length > 0 && q.q.length < 2) throw errors.validation([{ field: 'q', message: 'Digite ao menos 2 letras.' }]);
    const { lat, lng, ...filters } = q;
    return this.discovery.searchProducts({ lat, lng }, filters);
  }

  @Public()
  @RateLimit({ name: 'search', limit: 90, windowSeconds: 60 })
  @Get('search/suggestions')
  @Header('Cache-Control', PRIVATE_SHORT_CACHE)
  async suggestions(@Query(new ZodPipe(suggestionsQuery)) q: z.infer<typeof suggestionsQuery>) {
    return this.discovery.suggestions({ lat: q.lat, lng: q.lng }, q.q);
  }
}
