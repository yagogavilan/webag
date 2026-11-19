var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, HttpCode, Module, Param, Post } from '@nestjs/common';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { DevPaymentSimulator, PaymentsDevModule } from '../payments/payments.dev.js';
import { devSimulateSchema, uuid } from '../payments/payments.controllers.js';
import { OrdersModule } from './orders.module.js';
import { OrdersService } from './orders.service.js';
/**
 * F1 (app): simulação do pagamento POR PEDIDO, para o botão "Simular pagamento" do app (que só conhece o id do pedido, não o da tentativa).
 * Só a conta dona do pedido (404 para as demais), só provedor `fake` (409 nos demais) e só onde `devOrderModulesFor` registra o módulo
 * (development e test): em produção e no staging a rota nem existe (404, SEC-036/135). Mesmo caminho do webhook assinado da rota por tentativa.
 */
let OrdersPaymentDevController = class OrdersPaymentDevController {
    orders;
    simulator;
    constructor(orders, simulator) {
        this.orders = orders;
        this.simulator = simulator;
    }
    async approve(principal, orderId, body) {
        return this.simulator.simulate(await this.orders.paymentAttemptIdOf(principal, uuid(orderId)), 'approved', body);
    }
    async decline(principal, orderId, body) {
        return this.simulator.simulate(await this.orders.paymentAttemptIdOf(principal, uuid(orderId)), 'declined', body);
    }
    async expire(principal, orderId) {
        return this.simulator.simulate(await this.orders.paymentAttemptIdOf(principal, uuid(orderId)), 'expired', {});
    }
};
__decorate([
    HttpCode(200),
    Post(':orderId/payment/approve'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __param(2, Body(new ZodPipe(devSimulateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], OrdersPaymentDevController.prototype, "approve", null);
__decorate([
    HttpCode(200),
    Post(':orderId/payment/decline'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __param(2, Body(new ZodPipe(devSimulateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], OrdersPaymentDevController.prototype, "decline", null);
__decorate([
    HttpCode(200),
    Post(':orderId/payment/expire'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersPaymentDevController.prototype, "expire", null);
OrdersPaymentDevController = __decorate([
    Controller('v1/dev/orders'),
    __metadata("design:paramtypes", [OrdersService,
        DevPaymentSimulator])
], OrdersPaymentDevController);
export { OrdersPaymentDevController };
let OrdersDevModule = class OrdersDevModule {
};
OrdersDevModule = __decorate([
    Module({ imports: [OrdersModule, PaymentsDevModule], controllers: [OrdersPaymentDevController] })
], OrdersDevModule);
export { OrdersDevModule };
/** Módulos de simulação por pedido: nunca em produção nem no staging (SEC-036, SEC-135). */
export function devOrderModulesFor(nodeEnv) {
    return nodeEnv === 'development' || nodeEnv === 'test' ? [OrdersDevModule] : [];
}
//# sourceMappingURL=orders.dev.js.map