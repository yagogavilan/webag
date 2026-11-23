import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/index.js';
import { AddressesModule } from '../addresses/index.js';
import { AdminModule } from '../admin/index.js';
import { CampaignsModule } from '../campaigns/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { CartController } from './cart.controller.js';
import { CartService, PurchaseHistoryPort } from './cart.service.js';
import { MyCouponsController } from './my-coupons.controller.js';
import { MyCouponsService } from './my-coupons.service.js';
import { PaidPurchaseHistory } from './purchase-history.service.js';

@Module({
  imports: [AdminModule, CampaignsModule, AddressesModule, FinanceModule, LogisticsModule, MediaModule, StoresModule],
  controllers: [CartController, MyCouponsController],
  providers: [CartService, MyCouponsService, { provide: PurchaseHistoryPort, useClass: PaidPurchaseHistory }],
  exports: [CartService, PurchaseHistoryPort],
})
export class CartModule {}
