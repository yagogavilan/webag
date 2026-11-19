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
@Module({
  imports: [AdminModule, IdempotencyModule, NotificationsModule],
  controllers: [AdminPushController, PushCampaignOpenedController, AdminCouponsController, AdminHighlightsController],
  providers: [PushCampaignsService, PlatformCouponsService, HighlightsService],
  exports: [PushCampaignsService],
})
export class MarketingModule {}
