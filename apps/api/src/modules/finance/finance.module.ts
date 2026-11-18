import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { CommissionService } from './commission.service.js';
import { LedgerService } from './ledger.service.js';

@Module({
  imports: [AdminModule],
  providers: [CommissionService, LedgerService],
  exports: [CommissionService, LedgerService],
})
export class FinanceModule {}
