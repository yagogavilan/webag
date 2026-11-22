// API pública do módulo stores (ADR-007 §2).
export { StoresModule } from './stores.module.js';
export { StoresService, type Store } from './stores.service.js';
export { StoreSettingsService } from './store-settings.service.js';
export { type Actor } from './store-settings.service.js';
export { presentStore, uuidParam } from './stores.controllers.js';
export { isStoreVisible } from './domain/visibility.js';
export { isOpenNow, type WeeklyHours } from './domain/hours.js';
export { deliveryFee, type Tier } from './domain/delivery.js';
export { GEOCODING_PROVIDER, type GeocodingProvider, type CepResult, type CepInfo, type GeoPoint } from './geocoding.js';
export { hoursToday, isOpen, nextOpening, type OpeningInput } from './domain/opening.js';
export { ExposureLimitService } from './exposure-limit.service.js';
export { evaluateExposureLimit, type ExposureLimit } from './exposure-limit.js';
export { DeliveryQuoteRegistry, type DeliveryQuoter, type DeliveryQuoteSummary } from './delivery-quote.registry.js';
export { businessDeadline, isOverdue } from './domain/business-days.js';
export { AdminStoresService } from './admin-stores.service.js';
export { AdminStoreEditService } from './admin-store-edit.service.js';
export { ADMIN_REASON_CODES } from './domain/admin-reason.js';
