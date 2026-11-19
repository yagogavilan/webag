import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { FinanceModule } from '../finance/index.js';
import { PaymentsModule } from '../payments/index.js';
import { StoresModule } from '../stores/index.js';
import { CouriersService } from './couriers.service.js';
import { CouriersAdminController, DeliveriesAdminController, LogisticsReportsController } from './logistics.controllers.js';
import { LogisticsReportService } from './logistics-report.service.js';
import { DeliveriesService } from './deliveries.service.js';
import { DeliveryFeesAdminController } from './delivery-fees.controller.js';
import { DeliveryFeesService } from './delivery-fees.service.js';

@Module({
  imports: [AdminModule, FinanceModule, PaymentsModule, StoresModule],
  controllers: [DeliveryFeesAdminController, CouriersAdminController, DeliveriesAdminController, LogisticsReportsController],
  providers: [DeliveryFeesService, CouriersService, DeliveriesService, LogisticsReportService],
  exports: [DeliveryFeesService, CouriersService, DeliveriesService],
})
export class LogisticsModule {}
