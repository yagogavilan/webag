var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ExchangeEventBus_1;
import { Injectable, Logger } from '@nestjs/common';
let ExchangeEventBus = ExchangeEventBus_1 = class ExchangeEventBus {
    logger = new Logger(ExchangeEventBus_1.name);
    handlers = [];
    reminderHandlers = [];
    subscribeReminder(handler) {
        this.reminderHandlers.push(handler);
    }
    async emitReminder(reminder) {
        for (const handler of this.reminderHandlers) {
            try {
                await handler(reminder);
            }
            catch (error) {
                this.logger.warn(`handler de lembrete da troca ${reminder.number} falhou: ${error.message}`);
            }
        }
    }
    subscribe(handler) {
        this.handlers.push(handler);
    }
    async emit(event) {
        for (const handler of this.handlers) {
            try {
                await handler(event);
            }
            catch (error) {
                this.logger.warn(`handler de evento da troca ${event.number} falhou: ${error.message}`);
            }
        }
    }
};
ExchangeEventBus = ExchangeEventBus_1 = __decorate([
    Injectable()
], ExchangeEventBus);
export { ExchangeEventBus };
//# sourceMappingURL=exchange-events.bus.js.map