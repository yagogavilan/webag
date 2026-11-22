import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service.js';
import { StorefrontCacheService } from './storefront-cache.service.js';

/** Cache Redis de leitura e invalidação ativa dos caches da vitrine (DEC-113). Global: qualquer módulo invalida sem importar outro módulo. */
@Global()
@Module({ providers: [CacheService, StorefrontCacheService], exports: [CacheService, StorefrontCacheService] })
export class CacheModule {}
