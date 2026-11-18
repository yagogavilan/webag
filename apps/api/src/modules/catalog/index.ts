// API pública do módulo catalog (ADR-007 §2).
export { CatalogModule } from './catalog.module.js';
export { CatalogService, ProductOrdersPort } from './catalog.service.js';
export { isProductVisible, isOfferable } from './domain/stock.js';
export { effectivePrice } from './domain/price.js';
