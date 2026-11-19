import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { BannersController } from './banners.controller.js';
import { BannersService } from './banners.service.js';
import { BrowseController } from './browse.controller.js';
import { BrowseService } from './browse.service.js';
import { FavoritesService } from './favorites.service.js';
import { MeDiscoveryController } from './me-discovery.controller.js';
import { SearchHistoryService } from './search-history.service.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';
import { ProductFeedService } from './product-feed.service.js';
import { StoreFeedService } from './store-feed.service.js';

/** Descoberta do cliente (Onda 3): banners, home, busca e favoritos. Leitura pública com cache. */
@Module({
  imports: [AdminModule, LogisticsModule, MediaModule, StoresModule],
  controllers: [BannersController, DiscoveryController, BrowseController, MeDiscoveryController],
  providers: [FavoritesService, SearchHistoryService, BrowseService, BannersService, DiscoveryService, StoreFeedService, ProductFeedService],
  exports: [BannersService, DiscoveryService, StoreFeedService],
})
export class DiscoveryModule {}
