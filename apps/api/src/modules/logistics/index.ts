// API pública do módulo logistics (ADR-007 §2): taxa de entrega do admin e, depois, motoboys e entregas (L.3).
export { LogisticsModule } from './logistics.module.js';
export { computeEta, etaWindow, maxDistanceForCeilingM, presentEta, type EtaConfig, type EtaEstimate, type EtaView } from './domain/eta.js';
export { DeliveryFeesService, type DeliveryFeeSnapshot, type DeliveryQuote, type Destination } from './delivery-fees.service.js';
export { deliveryFeeTables, deliveryFeeTiers } from './db/schema.js';
export { applyFreeShipping, defaultExchangeFee, pickTier, startingFee } from './domain/fees.js';
export { CouriersService } from './couriers.service.js';
export { DeliveriesService, type CreateDeliveryInput, type Delivery, type DeliveryActor, type DeliveryListener } from './deliveries.service.js';
export { couriers, deliveries, deliveryEvents } from './db/schema.js';
export { DELIVERY_STATUSES, type DeliveryStatus, type DeliveryKind } from './domain/state.js';
export type { DeliveryMessageData } from './domain/whatsapp.js';
