import { Inject, Injectable, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AdminModule } from '../admin/index.js';
import { IdentityModule } from '../identity/index.js';
import { MediaModule } from '../media/index.js';
import { ACTIVE_STATUSES } from '../orders/domain/state.js'; // constante pura (sem serviço): não cria dependência de módulo nem ciclo
import { StoresModule } from '../stores/index.js';
import { AdminModerationController, AdminProductMetricsController, CatalogController } from './catalog.controllers.js';
import { BulkBatchesService } from './bulk-batches.service.js';
import { CatalogService, ProductOrdersPort } from './catalog.service.js';
import { ProductDraftsService } from './drafts.service.js';
import { DisabledExternalEanLookup, ExternalEanLookup } from './adapters/ean.js';
import { FakeProductVisionProvider, ProductVisionProvider } from './adapters/vision.js';
import { ProductMetricsService } from './product-metrics.service.js';
import { ProductTableService } from './product-table.service.js';
import { InventoryService } from './inventory.service.js';
import { ModerationService } from './moderation.service.js';

/**
 * Pedido em andamento de um produto (WB-060 C5). Leitura direta e só de leitura nas tabelas do pedido, para o catálogo não
 * depender do módulo de pedidos (que depende dele pela reserva de estoque): exceção registrada no ADR-007.
 */
@Injectable()
class SqlOpenOrders extends ProductOrdersPort {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {
    super();
  }

  async hasOpenOrders(productId: string): Promise<boolean> {
    const result = await this.db.execute(sql`
      select 1 from order_items oi join orders o on o.id = oi.order_id
      where oi.product_id = ${productId}
        and o.status in (${sql.join(ACTIVE_STATUSES.map((status) => sql`${status}`), sql`, `)})
      limit 1`);
    return result.rows.length > 0;
  }
}

@Module({
  imports: [AdminModule, IdentityModule, MediaModule, StoresModule],
  controllers: [CatalogController, AdminModerationController, AdminProductMetricsController],
  providers: [CatalogService, BulkBatchesService, ProductDraftsService, ProductTableService, ProductMetricsService, InventoryService, ModerationService, { provide: ProductOrdersPort, useClass: SqlOpenOrders },
    // F8/F9 (flags `ia_visao_real` e `ean_base_externa` desligadas): só os adaptadores que não saem para a rede.
    { provide: ProductVisionProvider, useClass: FakeProductVisionProvider },
    { provide: ExternalEanLookup, useClass: DisabledExternalEanLookup },
  ],
  exports: [CatalogService, InventoryService, ModerationService, ProductOrdersPort],
})
export class CatalogModule {}
