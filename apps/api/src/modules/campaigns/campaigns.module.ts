import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { IdempotencyModule } from '../idempotency/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { AdminCampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { CouponEvaluationService } from './coupon-evaluation.service.js';
import { FraudService } from './fraud.service.js';
import { ReservationService } from './reservation.service.js';

/** v1.1 R2 (ADR-019): campanhas, orçamento com reserva atômica, antifraude por HMAC. Não importa `cart` nem `orders` (B2): quem reserva é o `orders`, pela porta `index.ts`. */
@Module({
  imports: [AdminModule, IdempotencyModule, LogisticsModule],
  controllers: [AdminCampaignsController],
  providers: [CampaignsService, CouponEvaluationService, FraudService, ReservationService],
  exports: [CampaignsService, CouponEvaluationService, FraudService, ReservationService],
})
export class CampaignsModule {}
