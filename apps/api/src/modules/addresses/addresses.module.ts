import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { StoresModule } from '../stores/index.js';
import { AddressesController } from './addresses.controller.js';
import { AddressesService } from './addresses.service.js';

@Module({
  imports: [AdminModule, StoresModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
