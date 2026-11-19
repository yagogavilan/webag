import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { CatalogModule } from '../catalog/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { IdentityModule } from '../identity/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { MediaModule } from '../media/index.js';
import { PaymentsModule } from '../payments/index.js';
import { StoresModule } from '../stores/index.js';
import { ExchangeEventBus } from './exchange-events.bus.js';
import { ExchangesController, StoreExchangesController } from './exchanges.controllers.js';
import { ExchangesService } from './exchanges.service.js';

@Module({
  imports: [AdminModule, CatalogModule, IdempotencyModule, IdentityModule, LogisticsModule, MediaModule, PaymentsModule, StoresModule],
  controllers: [ExchangesController, StoreExchangesController],
  providers: [ExchangesService, ExchangeEventBus],
  exports: [ExchangesService, ExchangeEventBus],
})
export class ExchangesModule {}
