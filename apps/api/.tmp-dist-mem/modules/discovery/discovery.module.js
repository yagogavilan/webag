var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { BannersController } from './banners.controller.js';
import { BannersService } from './banners.service.js';
import { BrowseController } from './browse.controller.js';
import { BrowseService } from './browse.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { FavoritesService } from './favorites.service.js';
import { MeDiscoveryController } from './me-discovery.controller.js';
import { SearchHistoryService } from './search-history.service.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';
import { ProductFeedService } from './product-feed.service.js';
import { StoreFeedService } from './store-feed.service.js';
/** Descoberta do cliente (Onda 3): banners, home, busca e favoritos. Leitura pública com cache. */
let DiscoveryModule = class DiscoveryModule {
};
DiscoveryModule = __decorate([
    Module({
        imports: [AdminModule, LogisticsModule, MediaModule, StoresModule],
        controllers: [BannersController, DiscoveryController, BrowseController, MeDiscoveryController, ReviewsController],
        providers: [ReviewsService, FavoritesService, SearchHistoryService, BrowseService, BannersService, DiscoveryService, StoreFeedService, ProductFeedService],
        exports: [BannersService, DiscoveryService, StoreFeedService],
    })
], DiscoveryModule);
export { DiscoveryModule };
//# sourceMappingURL=discovery.module.js.map