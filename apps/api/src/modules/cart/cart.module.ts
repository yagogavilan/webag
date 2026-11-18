import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/index.js';
import { AddressesModule } from '../addresses/index.js';
import { AdminModule } from '../admin/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { CartController } from './cart.controller.js';
import { CartService, PurchaseHistoryPort } from './cart.service.js';

/** Até a Onda 4 não há pedidos: ninguém tem compra paga (cupom de primeira compra vale para todos). */
class NoPaidOrdersYet extends PurchaseHistoryPort {
  hasPaidOrder(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

@Module({
  imports: [AdminModule, AddressesModule, FinanceModule, MediaModule, StoresModule],
  controllers: [CartController],
  providers: [CartService, { provide: PurchaseHistoryPort, useClass: NoPaidOrdersYet }],
  exports: [CartService, PurchaseHistoryPort],
})
export class CartModule {}
