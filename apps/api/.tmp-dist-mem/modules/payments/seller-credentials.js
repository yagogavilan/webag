var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
/**
 * Quem guarda os tokens (módulo de lojas, cifrados) se registra aqui; o adaptador do provedor só pergunta. Evita o ciclo
 * payments -> stores -> payments e mantém os tokens fora do módulo de pagamentos.
 */
let SellerCredentialsRegistry = class SellerCredentialsRegistry {
    resolver = null;
    register(resolver) {
        this.resolver = resolver;
    }
    async resolve(storeId, accountId) {
        return this.resolver ? this.resolver(storeId, accountId) : null;
    }
};
SellerCredentialsRegistry = __decorate([
    Injectable()
], SellerCredentialsRegistry);
export { SellerCredentialsRegistry };
//# sourceMappingURL=seller-credentials.js.map