import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { BrowseService } from './browse.service.js';
import { geoQuery } from './geo.js';

const storeQuery = z.strictObject({ lat: geoQuery.lat.optional(), lng: geoQuery.lng.optional() }).refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: 'Informe latitude e longitude juntas.', path: ['lat'] });
const listQuery = z.strictObject({ sectionId: z.uuid().optional(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });
const pageQuery = z.strictObject({ cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() });

const SHORT = 'public, max-age=30';

/** Loja e produto públicos (WB-016, WB-017, WB-018). Sem login; loja fechada é navegável (DEC-022). */
@Controller('v1/browse')
export class BrowseController {
  constructor(private readonly browse: BrowseService) {}

  /** Com `lat`/`lng` calcula a entrega para aquela posição; sem elas, só os dados da loja. Posição no query => cache só no aparelho. */
  @Public()
  @RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 })
  @Get('stores/:storeId')
  @Header('Cache-Control', 'private, max-age=30')
  store(@Param('storeId') storeId: string, @Query(new ZodPipe(storeQuery)) q: z.infer<typeof storeQuery>) {
    return this.browse.store(uuidParam(storeId), q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null);
  }

  @Public()
  @RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 })
  @Get('stores/:storeId/products')
  @Header('Cache-Control', SHORT)
  storeProducts(@Param('storeId') storeId: string, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.browse.storeProducts(uuidParam(storeId), q);
  }

  @Public()
  @RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 })
  @Get('stores/:storeId/reviews')
  @Header('Cache-Control', SHORT)
  storeReviews(@Param('storeId') storeId: string, @Query(new ZodPipe(pageQuery)) q: z.infer<typeof pageQuery>) {
    return this.browse.reviewsOf({ storeId: uuidParam(storeId) }, q);
  }

  @Public()
  @RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 })
  @Get('products/:productId')
  @Header('Cache-Control', 'private, max-age=30')
  product(@Param('productId') productId: string, @Query(new ZodPipe(storeQuery)) q: z.infer<typeof storeQuery>) {
    // Com `lat`/`lng` a página traz a entrega e o ETA (DEC-053) para aquela posição; sem elas, só o produto.
    return this.browse.product(uuidParam(productId), q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null);
  }

  @Public()
  @RateLimit({ name: 'browse', limit: 180, windowSeconds: 60 })
  @Get('products/:productId/reviews')
  @Header('Cache-Control', SHORT)
  productReviews(@Param('productId') productId: string, @Query(new ZodPipe(pageQuery)) q: z.infer<typeof pageQuery>) {
    return this.browse.reviewsOf({ productId: uuidParam(productId) }, q);
  }
}
