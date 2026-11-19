import { Module } from '@nestjs/common';
import { ExchangesModule } from '../exchanges/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrdersModule } from '../orders/index.js';
import { RealtimeTicketsController } from './realtime-tickets.controller.js';
import { RealtimeTicketService } from './realtime-ticket.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';

@Module({
  imports: [IdentityModule, OrdersModule, ExchangesModule],
  controllers: [RealtimeTicketsController],
  providers: [RealtimeGateway, RealtimeService, RealtimeTicketService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
