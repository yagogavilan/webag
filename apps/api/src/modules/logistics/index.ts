// API pública do módulo logistics (ADR-007 §2): taxa de entrega do admin e, depois, motoboys e entregas (L.3).
export { LogisticsModule } from './logistics.module.js';
export { DeliveryFeesService, type DeliveryFeeSnapshot, type DeliveryQuote, type Destination } from './delivery-fees.service.js';
export { deliveryFeeTables, deliveryFeeTiers } from './db/schema.js';
export { applyFreeShipping, defaultExchangeFee, pickTier, startingFee } from './domain/fees.js';
