var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { HighlightsService } from './highlights.service.js';
import { AdminCouponsController, AdminHighlightsController } from './marketing-admin.controller.js';
import { PlatformCouponsService } from './platform-coupons.service.js';
import { AdminPushController, PushCampaignOpenedController } from './push-campaigns.controller.js';
import { PushCampaignsService } from './push-campaigns.service.js';
/** O6.3: marketing do admin (push segmentado e, em seguida, cupons da plataforma e destaques). */
let MarketingModule = class MarketingModule {
};
MarketingModule = __decorate([
    Module({
        imports: [AdminModule, IdempotencyModule, NotificationsModule],
        controllers: [AdminPushController, PushCampaignOpenedController, AdminCouponsController, AdminHighlightsController],
        providers: [PushCampaignsService, PlatformCouponsService, HighlightsService],
        exports: [PushCampaignsService],
    })
], MarketingModule);
export { MarketingModule };
//# sourceMappingURL=marketing.module.js.map