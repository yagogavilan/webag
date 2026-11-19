// API pública do módulo stores (ADR-007 §2).
export { StoresModule } from './stores.module.js';
export { StoresService } from './stores.service.js';
export { StoreSettingsService } from './store-settings.service.js';
export { presentStore, uuidParam } from './stores.controllers.js';
export { isStoreVisible } from './domain/visibility.js';
export { isOpenNow } from './domain/hours.js';
export { deliveryFee } from './domain/delivery.js';
export { GEOCODING_PROVIDER } from './geocoding.js';
export { hoursToday, isOpen, nextOpening } from './domain/opening.js';
export { ExposureLimitService } from './exposure-limit.service.js';
export { evaluateExposureLimit } from './exposure-limit.js';
export { DeliveryQuoteRegistry } from './delivery-quote.registry.js';
export { businessDeadline, isOverdue } from './domain/business-days.js';
//# sourceMappingURL=index.js.map