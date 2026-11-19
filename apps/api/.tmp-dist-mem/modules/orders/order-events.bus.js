var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var OrderEventBus_1;
import { Injectable, Logger } from '@nestjs/common';
/**
 * Barramento interno e síncrono (sem fila externa: o MVP não precisa). Cada handler roda isolado: falha de push ou de
 * e-mail nunca desfaz nem atrasa o pedido (o cliente sempre recupera o estado pelo REST).
 */
let OrderEventBus = OrderEventBus_1 = class OrderEventBus {
    logger = new Logger(OrderEventBus_1.name);
    handlers = [];
    subscribe(handler) {
        this.handlers.push(handler);
    }
    async emit(event) {
        for (const handler of this.handlers) {
            try {
                await handler(event);
            }
            catch (error) {
                this.logger.warn(`handler de evento do pedido ${event.number} falhou: ${error.message}`);
            }
        }
    }
};
OrderEventBus = OrderEventBus_1 = __decorate([
    Injectable()
], OrderEventBus);
export { OrderEventBus };
//# sourceMappingURL=order-events.bus.js.map