import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { CommissionService } from './commission.service.js';
import { CommissionAdminController } from './finance.controllers.js';
import { StoreFinanceController } from './store-finance.controller.js';
import { StoreFinanceService } from './store-finance.service.js';
import { LedgerService } from './ledger.service.js';

@Module({
  imports: [AdminModule],
  controllers: [CommissionAdminController, StoreFinanceController],
  providers: [CommissionService, LedgerService, StoreFinanceService],
  exports: [CommissionService, LedgerService],
})
export class FinanceModule {}
