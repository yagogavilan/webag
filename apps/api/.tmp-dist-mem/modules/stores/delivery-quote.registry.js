var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
/**
 * A taxa de entrega é da Webag (DEC-036): quem a calcula é o módulo de logística, que se registra aqui. Evita o ciclo
 * stores -> logistics -> stores (mesmo padrão do `SellerCredentialsRegistry` nos pagamentos).
 */
let DeliveryQuoteRegistry = class DeliveryQuoteRegistry {
    quoter = null;
    register(quoter) {
        this.quoter = quoter;
    }
    async quote(storeId, point, subtotalCents) {
        if (!this.quoter)
            return { available: false, distanceM: null, feeCents: null, freeShipping: false, belowMinimum: false };
        return this.quoter(storeId, point, subtotalCents);
    }
};
DeliveryQuoteRegistry = __decorate([
    Injectable()
], DeliveryQuoteRegistry);
export { DeliveryQuoteRegistry };
//# sourceMappingURL=delivery-quote.registry.js.map