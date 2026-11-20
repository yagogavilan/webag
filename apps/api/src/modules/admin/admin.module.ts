import { Module } from '@nestjs/common';
import {
  CategoriesController,
  ConfigController,
  LegalController,
  RegionsController,
} from './admin.controllers.js';
import { AuditService } from './audit.service.js';
import { CategoriesService } from './categories.service.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { LegalService } from './legal.service.js';
import { MaintenanceService } from './maintenance.service.js';
import { ParametersService } from './parameters.service.js';
import { RegionsService } from './regions.service.js';

@Module({
  controllers: [RegionsController, CategoriesController, ConfigController, LegalController],
  providers: [AuditService, ParametersService, FeatureFlagsService, MaintenanceService, LegalService, RegionsService, CategoriesService],
  exports: [AuditService, ParametersService, FeatureFlagsService, MaintenanceService, LegalService, RegionsService, CategoriesService],
})
export class AdminModule {}
