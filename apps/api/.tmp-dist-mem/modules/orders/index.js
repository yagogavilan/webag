// API pública do módulo orders (ADR-007 §2).
export { OrdersModule } from './orders.module.js';
export { OrdersService } from './orders.service.js';
export { LateDeliveryService } from './late-delivery.service.js';
export { MIN_ORDERS_FOR_CANCEL_ALERT } from './orders.service.js';
export { OrderEventBus } from './order-events.bus.js';
export { canTransition, nextStatuses, ORDER_STATUSES } from './domain/state.js';
export { StoreOrdersService, storeActions } from './store-orders.service.js';
export { devOrderModulesFor } from './orders.dev.js';
//# sourceMappingURL=index.js.map