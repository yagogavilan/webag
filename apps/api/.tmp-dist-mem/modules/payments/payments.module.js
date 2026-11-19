var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminModule } from '../admin/index.js';
import { PaymentsAdminController, WebhooksController } from './payments.controllers.js';
import { SellerCredentialsRegistry } from './seller-credentials.js';
import { PaymentsService } from './payments.service.js';
import { PAYMENT_PROVIDER } from './payment-provider.js';
import { FakePaymentProvider } from './providers/fake.provider.js';
import { MercadoPagoPaymentProvider } from './providers/mercadopago.provider.js';
let PaymentsModule = class PaymentsModule {
};
PaymentsModule = __decorate([
    Module({
        imports: [AdminModule],
        controllers: [WebhooksController, PaymentsAdminController],
        providers: [
            SellerCredentialsRegistry,
            FakePaymentProvider,
            MercadoPagoPaymentProvider,
            {
                provide: PAYMENT_PROVIDER,
                inject: [ConfigService, FakePaymentProvider, MercadoPagoPaymentProvider],
                // PAYMENT_PROVIDER=fake em produção nem chega aqui: o env falha no boot (SEC-036).
                useFactory: (config, fake, mp) => config.get('PAYMENT_PROVIDER', { infer: true }) === 'mercadopago' ? mp : fake,
            },
            PaymentsService,
        ],
        exports: [PaymentsService, FakePaymentProvider, PAYMENT_PROVIDER, SellerCredentialsRegistry],
    })
], PaymentsModule);
export { PaymentsModule };
//# sourceMappingURL=payments.module.js.map