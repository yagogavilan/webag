// API pública do módulo campaigns (ADR-007 §2, ADR-019 B2): `cart` e `orders` só usam o que sai daqui.
export { CampaignsModule } from './campaigns.module.js';
export { CampaignsService, generatePrivateCode } from './campaigns.service.js';
export { CouponEvaluationService, type CampaignRejection, type EvaluationInput, type EvaluationResult } from './coupon-evaluation.service.js';
export { FraudService, type FraudIdentifier, type FraudRejection, type FraudSubject } from './fraud.service.js';
export { ReservationService, discountChanged, type ReserveInput } from './reservation.service.js';
export { couponRedemptions, coupons } from './db/schema.js';
