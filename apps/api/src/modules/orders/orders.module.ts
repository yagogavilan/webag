import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { CartModule } from '../cart/index.js';
import { CatalogModule } from '../catalog/index.js';
import { FinanceModule } from '../finance/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { MediaModule } from '../media/index.js';
import { PaymentsModule } from '../payments/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrderEventBus } from './order-events.bus.js';
import { OrdersController } from './orders.controller.js';
import { StoreOrdersController } from './store-orders.controller.js';
import { StoreOrdersService } from './store-orders.service.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AdminModule, IdentityModule, CartModule, CatalogModule, FinanceModule, IdempotencyModule, MediaModule, PaymentsModule],
  controllers: [OrdersController, StoreOrdersController],
  providers: [OrdersService, StoreOrdersService, OrderEventBus],
  exports: [OrdersService, StoreOrdersService, OrderEventBus],
})
export class OrdersModule {}
