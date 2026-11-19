import { Module } from '@nestjs/common';
import { ExchangesModule } from '../exchanges/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrdersModule } from '../orders/index.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';

@Module({
  imports: [IdentityModule, OrdersModule, ExchangesModule],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
