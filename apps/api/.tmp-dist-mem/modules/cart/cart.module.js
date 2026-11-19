var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/index.js';
import { AddressesModule } from '../addresses/index.js';
import { AdminModule } from '../admin/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { CartController } from './cart.controller.js';
import { CartService, PurchaseHistoryPort } from './cart.service.js';
import { MyCouponsController } from './my-coupons.controller.js';
import { MyCouponsService } from './my-coupons.service.js';
import { PaidPurchaseHistory } from './purchase-history.service.js';
let CartModule = class CartModule {
};
CartModule = __decorate([
    Module({
        imports: [AdminModule, AddressesModule, FinanceModule, LogisticsModule, MediaModule, StoresModule],
        controllers: [CartController, MyCouponsController],
        providers: [CartService, MyCouponsService, { provide: PurchaseHistoryPort, useClass: PaidPurchaseHistory }],
        exports: [CartService, PurchaseHistoryPort],
    })
], CartModule);
export { CartModule };
//# sourceMappingURL=cart.module.js.map