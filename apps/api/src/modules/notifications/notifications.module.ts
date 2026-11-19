import { Module } from '@nestjs/common';
import { ExchangesModule } from '../exchanges/index.js';
import { MailModule } from '../../platform/mail/mail.module.js';
import { OrdersModule } from '../orders/index.js';
import { PushDevicesController } from './devices.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushTransport } from './push.transport.js';

@Module({
  imports: [MailModule, OrdersModule, ExchangesModule],
  controllers: [PushDevicesController],
  providers: [NotificationsService, PushTransport],
  exports: [PushTransport],
})
export class NotificationsModule {}
