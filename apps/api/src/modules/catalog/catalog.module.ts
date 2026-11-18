import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { IdentityModule } from '../identity/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { AdminModerationController, CatalogController } from './catalog.controllers.js';
import { CatalogService, ProductOrdersPort } from './catalog.service.js';
import { ModerationService } from './moderation.service.js';

/** Enquanto não há pedidos (Onda 4), nenhum produto tem pedido em andamento. */
class NoOpenOrders extends ProductOrdersPort {
  hasOpenOrders(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

@Module({
  imports: [AdminModule, IdentityModule, MediaModule, StoresModule],
  controllers: [CatalogController, AdminModerationController],
  providers: [CatalogService, ModerationService, { provide: ProductOrdersPort, useClass: NoOpenOrders }],
  exports: [CatalogService, ModerationService, ProductOrdersPort],
})
export class CatalogModule {}
