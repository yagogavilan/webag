// API pública do módulo stores (ADR-007 §2).
export { StoresModule } from './stores.module.js';
export { StoresService, type Store } from './stores.service.js';
export { StoreSettingsService } from './store-settings.service.js';
export { type Actor } from './store-settings.service.js';
export { presentStore, uuidParam } from './stores.controllers.js';
export { isStoreVisible } from './domain/visibility.js';
export { isOpenNow } from './domain/hours.js';
export { deliveryFee } from './domain/delivery.js';
