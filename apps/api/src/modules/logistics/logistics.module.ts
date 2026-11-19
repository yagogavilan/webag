import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { StoresModule } from '../stores/index.js';
import { DeliveryFeesAdminController } from './delivery-fees.controller.js';
import { DeliveryFeesService } from './delivery-fees.service.js';

@Module({
  imports: [AdminModule, StoresModule],
  controllers: [DeliveryFeesAdminController],
  providers: [DeliveryFeesService],
  exports: [DeliveryFeesService],
})
export class LogisticsModule {}
