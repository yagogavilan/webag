// API pública do módulo exchanges (ADR-007 §2).
export { ExchangesModule } from './exchanges.module.js';
export { ExchangesService } from './exchanges.service.js';
export { ExchangeEventBus, type ExchangeEvent, type ExchangeReminder } from './exchange-events.bus.js';
export { exchangeRequests, exchangeEvents } from './db/schema.js';
