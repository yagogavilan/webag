import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { CartModule } from '../cart/index.js';
import { CatalogModule } from '../catalog/index.js';
import { FinanceModule } from '../finance/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { MediaModule } from '../media/index.js';
import { PaymentsModule } from '../payments/index.js';
import { IdentityModule } from '../identity/index.js';
import { StoresModule } from '../stores/index.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { AdminOrdersReadService } from './admin-orders-read.service.js';
import { OrderEventBus } from './order-events.bus.js';
import { CardIntentService } from './card-intent.service.js';
import { CardIntentController, OrdersController } from './orders.controller.js';
import { StoreOrdersController } from './store-orders.controller.js';
import { StoreOrdersService } from './store-orders.service.js';
import { LateDeliveryService } from './late-delivery.service.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AdminModule, IdentityModule, CartModule, CatalogModule, FinanceModule, IdempotencyModule, LogisticsModule, MediaModule, PaymentsModule, StoresModule],
  controllers: [OrdersController, CardIntentController, StoreOrdersController, AdminOrdersController],
  providers: [OrdersService, LateDeliveryService, StoreOrdersService, OrderEventBus, CardIntentService, AdminOrdersReadService],
  exports: [OrdersService, LateDeliveryService, StoreOrdersService, OrderEventBus],
})
export class OrdersModule {}
