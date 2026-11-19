import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { PaymentsModule } from '../payments/index.js';
import { StoresModule } from '../stores/index.js';
import { CouriersService } from './couriers.service.js';
import { CouriersAdminController, DeliveriesAdminController } from './logistics.controllers.js';
import { DeliveriesService } from './deliveries.service.js';
import { DeliveryFeesAdminController } from './delivery-fees.controller.js';
import { DeliveryFeesService } from './delivery-fees.service.js';

@Module({
  imports: [AdminModule, PaymentsModule, StoresModule],
  controllers: [DeliveryFeesAdminController, CouriersAdminController, DeliveriesAdminController],
  providers: [DeliveryFeesService, CouriersService, DeliveriesService],
  exports: [DeliveryFeesService, CouriersService, DeliveriesService],
})
export class LogisticsModule {}
