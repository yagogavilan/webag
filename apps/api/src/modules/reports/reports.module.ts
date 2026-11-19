import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({ imports: [AdminModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
