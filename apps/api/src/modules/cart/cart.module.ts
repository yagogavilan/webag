import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/index.js';
import { AddressesModule } from '../addresses/index.js';
import { AdminModule } from '../admin/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { CartController } from './cart.controller.js';
import { CartService, PurchaseHistoryPort } from './cart.service.js';
import { PaidPurchaseHistory } from './purchase-history.service.js';

@Module({
  imports: [AdminModule, AddressesModule, FinanceModule, LogisticsModule, MediaModule, StoresModule],
  controllers: [CartController],
  providers: [CartService, { provide: PurchaseHistoryPort, useClass: PaidPurchaseHistory }],
  exports: [CartService, PurchaseHistoryPort],
})
export class CartModule {}
