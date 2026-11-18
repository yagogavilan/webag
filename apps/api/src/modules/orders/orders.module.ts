import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { CartModule } from '../cart/index.js';
import { CatalogModule } from '../catalog/index.js';
import { FinanceModule } from '../finance/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { MediaModule } from '../media/index.js';
import { PaymentsModule } from '../payments/index.js';
import { OrderEventBus } from './order-events.bus.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AdminModule, CartModule, CatalogModule, FinanceModule, IdempotencyModule, MediaModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderEventBus],
  exports: [OrdersService, OrderEventBus],
})
export class OrdersModule {}
