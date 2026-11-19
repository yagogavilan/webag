var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
import { LogisticsAvailabilityController } from './logistics-availability.controller.js';
import { LogisticsAvailabilityService } from './logistics-availability.service.js';
let LogisticsModule = class LogisticsModule {
};
LogisticsModule = __decorate([
    Module({
        imports: [AdminModule, FinanceModule, PaymentsModule, StoresModule],
        controllers: [LogisticsAvailabilityController, DeliveryFeesAdminController, CouriersAdminController, DeliveriesAdminController, LogisticsReportsController],
        providers: [LogisticsAvailabilityService, DeliveryFeesService, CouriersService, DeliveriesService, LogisticsReportService],
        exports: [LogisticsAvailabilityService, DeliveryFeesService, CouriersService, DeliveriesService],
    })
], LogisticsModule);
export { LogisticsModule };
//# sourceMappingURL=logistics.module.js.map