import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { FinanceModule } from '../finance/index.js';
import { PaymentsModule } from '../payments/index.js';
import { StoresModule } from '../stores/index.js';
import { CouriersService } from './couriers.service.js';
import { CouriersAdminController, DeliveriesAdminController, LogisticsReportsController, LogisticsStatsController } from './logistics.controllers.js';
import { LogisticsReportService } from './logistics-report.service.js';
import { DeliveriesService } from './deliveries.service.js';
import { DeliveryFeesAdminController, StoreDeliveryPreviewController } from './delivery-fees.controller.js';
import { DeliveryFeesService } from './delivery-fees.service.js';
import { LogisticsAvailabilityController } from './logistics-availability.controller.js';
import { LogisticsAvailabilityService } from './logistics-availability.service.js';

@Module({
  imports: [AdminModule, FinanceModule, PaymentsModule, StoresModule],
  controllers: [LogisticsAvailabilityController, DeliveryFeesAdminController, StoreDeliveryPreviewController, CouriersAdminController, DeliveriesAdminController, LogisticsReportsController, LogisticsStatsController],
  providers: [LogisticsAvailabilityService, DeliveryFeesService, CouriersService, DeliveriesService, LogisticsReportService],
  exports: [LogisticsAvailabilityService, DeliveryFeesService, CouriersService, DeliveriesService],
})
export class LogisticsModule {}
