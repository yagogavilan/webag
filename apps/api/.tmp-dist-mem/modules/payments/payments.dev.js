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
import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post } from '@nestjs/common';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { devCreateSchema, devSimulateSchema, presentAttempt, uuid } from './payments.controllers.js';
import { PaymentsModule } from './payments.module.js';
import { PaymentsService } from './payments.service.js';
import { FakePaymentProvider } from './providers/fake.provider.js';
/** Muda o estado no "provedor" e entrega a notificação assinada pelo mesmo caminho do webhook real (compartilhado pelas duas rotas dev). */
let DevPaymentSimulator = class DevPaymentSimulator {
    payments;
    fake;
    constructor(payments, fake) {
        this.payments = payments;
        this.fake = fake;
    }
    async simulate(attemptId, outcome, options) {
        const attempt = await this.payments.getAttempt(uuid(attemptId));
        if (!attempt.providerPaymentId)
            throw errors.conflict('DEV_PAYMENT_NOT_CREATED', 'Pagamento ainda não foi criado no provedor');
        if (attempt.provider !== 'fake')
            throw errors.conflict('DEV_PROVIDER_NOT_FAKE', 'Só funciona com o provedor fake');
        const notification = await this.fake.simulate(attempt.providerPaymentId, { outcome, ...options });
        const webhook = await this.payments.receiveWebhook(notification);
        await this.payments.processDue();
        await this.payments.drain();
        return { webhook: { duplicate: !webhook.queued }, payment: presentAttempt(await this.payments.getAttempt(attempt.id)) };
    }
};
DevPaymentSimulator = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PaymentsService,
        FakePaymentProvider])
], DevPaymentSimulator);
export { DevPaymentSimulator };
/**
 * Simulação de pagamento SÓ para desenvolvimento e teste (WB-150 C2). Este módulo NÃO é registrado em produção
 * (ver `devModulesFor`): lá a rota nem existe (404), não é 403 (SEC-036). Exige login para evitar uso anônimo.
 */
let PaymentsDevController = class PaymentsDevController {
    payments;
    simulator;
    constructor(payments, simulator) {
        this.payments = payments;
        this.simulator = simulator;
    }
    async create(_principal, body) {
        return presentAttempt(await this.payments.createPayment(body));
    }
    async get(attemptId) {
        return presentAttempt(await this.payments.getAttempt(uuid(attemptId)));
    }
    approve(attemptId, body) {
        return this.simulator.simulate(attemptId, 'approved', body);
    }
    decline(attemptId, body) {
        return this.simulator.simulate(attemptId, 'declined', body);
    }
    expire(attemptId) {
        return this.simulator.simulate(attemptId, 'expired', {});
    }
};
__decorate([
    Post(),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(devCreateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentsDevController.prototype, "create", null);
__decorate([
    Get(':attemptId'),
    __param(0, Param('attemptId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsDevController.prototype, "get", null);
__decorate([
    HttpCode(200),
    Post(':attemptId/approve'),
    __param(0, Param('attemptId')),
    __param(1, Body(new ZodPipe(devSimulateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PaymentsDevController.prototype, "approve", null);
__decorate([
    HttpCode(200),
    Post(':attemptId/decline'),
    __param(0, Param('attemptId')),
    __param(1, Body(new ZodPipe(devSimulateSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PaymentsDevController.prototype, "decline", null);
__decorate([
    HttpCode(200),
    Post(':attemptId/expire'),
    __param(0, Param('attemptId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PaymentsDevController.prototype, "expire", null);
PaymentsDevController = __decorate([
    Controller('v1/dev/payments'),
    __metadata("design:paramtypes", [PaymentsService,
        DevPaymentSimulator])
], PaymentsDevController);
export { PaymentsDevController };
let PaymentsDevModule = class PaymentsDevModule {
};
PaymentsDevModule = __decorate([
    Module({ imports: [PaymentsModule], controllers: [PaymentsDevController], providers: [DevPaymentSimulator], exports: [DevPaymentSimulator] })
], PaymentsDevModule);
export { PaymentsDevModule };
/** Módulos de simulação: nunca em produção (SEC-036). */
export function devModulesFor(nodeEnv) {
    // SEC-135: só development e test. O staging (NODE_ENV=production + APP_ENV=staging, DT-038) NÃO registra as rotas.
    return nodeEnv === 'development' || nodeEnv === 'test' ? [PaymentsDevModule] : [];
}
//# sourceMappingURL=payments.dev.js.map