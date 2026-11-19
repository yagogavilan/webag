// API pública do módulo orders (ADR-007 §2).
export { OrdersModule } from './orders.module.js';
export { OrdersService } from './orders.service.js';
export { LateDeliveryService } from './late-delivery.service.js';
export { OrderEventBus, type OrderEvent } from './order-events.bus.js';
export { canTransition, nextStatuses, ORDER_STATUSES, type OrderActor, type OrderStatus } from './domain/state.js';
export { StoreOrdersService, storeActions, type StoreAction } from './store-orders.service.js';
