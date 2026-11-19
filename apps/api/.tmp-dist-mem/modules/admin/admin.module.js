var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { CategoriesController, ConfigController, LegalController, RegionsController, } from './admin.controllers.js';
import { AuditService } from './audit.service.js';
import { CategoriesService } from './categories.service.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { LegalService } from './legal.service.js';
import { ParametersService } from './parameters.service.js';
import { RegionsService } from './regions.service.js';
let AdminModule = class AdminModule {
};
AdminModule = __decorate([
    Module({
        controllers: [RegionsController, CategoriesController, ConfigController, LegalController],
        providers: [AuditService, ParametersService, FeatureFlagsService, LegalService, RegionsService, CategoriesService],
        exports: [AuditService, ParametersService, FeatureFlagsService, LegalService, RegionsService, CategoriesService],
    })
], AdminModule);
export { AdminModule };
//# sourceMappingURL=admin.module.js.map