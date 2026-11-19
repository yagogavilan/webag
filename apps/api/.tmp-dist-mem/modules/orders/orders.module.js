var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
import { OrderEventBus } from './order-events.bus.js';
import { CardIntentService } from './card-intent.service.js';
import { CardIntentController, OrdersController } from './orders.controller.js';
import { StoreOrdersController } from './store-orders.controller.js';
import { StoreOrdersService } from './store-orders.service.js';
import { LateDeliveryService } from './late-delivery.service.js';
import { OrdersService } from './orders.service.js';
let OrdersModule = class OrdersModule {
};
OrdersModule = __decorate([
    Module({
        imports: [AdminModule, IdentityModule, CartModule, CatalogModule, FinanceModule, IdempotencyModule, LogisticsModule, MediaModule, PaymentsModule, StoresModule],
        controllers: [OrdersController, CardIntentController, StoreOrdersController, AdminOrdersController],
        providers: [OrdersService, LateDeliveryService, StoreOrdersService, OrderEventBus, CardIntentService],
        exports: [OrdersService, LateDeliveryService, StoreOrdersService, OrderEventBus],
    })
], OrdersModule);
export { OrdersModule };
//# sourceMappingURL=orders.module.js.map