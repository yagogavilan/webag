// API pública do módulo logistics (ADR-007 §2): taxa de entrega do admin e, depois, motoboys e entregas (L.3).
export { LogisticsModule } from './logistics.module.js';
export { computeEta, etaWindow, maxDistanceForCeilingM, presentEta } from './domain/eta.js';
export { DeliveryFeesService } from './delivery-fees.service.js';
export { deliveryFeeTables, deliveryFeeTiers } from './db/schema.js';
export { applyFreeShipping, defaultExchangeFee, pickTier, startingFee } from './domain/fees.js';
export { CouriersService } from './couriers.service.js';
export { DeliveriesService } from './deliveries.service.js';
export { couriers, deliveries, deliveryEvents } from './db/schema.js';
export { DELIVERY_STATUSES } from './domain/state.js';
export { LogisticsAvailabilityService } from './logistics-availability.service.js';
export { logisticsPauses } from './db/schema.js';
//# sourceMappingURL=index.js.map