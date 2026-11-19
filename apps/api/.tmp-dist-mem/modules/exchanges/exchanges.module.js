var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { CatalogModule } from '../catalog/index.js';
import { FinanceModule } from '../finance/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { IdentityModule } from '../identity/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { MediaModule } from '../media/index.js';
import { PaymentsModule } from '../payments/index.js';
import { StoresModule } from '../stores/index.js';
import { ExchangeEventBus } from './exchange-events.bus.js';
import { ExchangeMediationAdminController, ExchangeRequestsAdminController, ExchangesAdminController, ExchangesController, StoreExchangesController } from './exchanges.controllers.js';
import { ExchangesReportService } from './exchanges-report.service.js';
import { ExchangesService } from './exchanges.service.js';
let ExchangesModule = class ExchangesModule {
};
ExchangesModule = __decorate([
    Module({
        imports: [AdminModule, CatalogModule, FinanceModule, IdempotencyModule, IdentityModule, LogisticsModule, MediaModule, PaymentsModule, StoresModule],
        controllers: [ExchangesController, StoreExchangesController, ExchangesAdminController, ExchangeMediationAdminController, ExchangeRequestsAdminController],
        providers: [ExchangesService, ExchangesReportService, ExchangeEventBus],
        exports: [ExchangesService, ExchangeEventBus],
    })
], ExchangesModule);
export { ExchangesModule };
//# sourceMappingURL=exchanges.module.js.map