import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../platform/config/env.js';
import { AdminModule } from '../admin/index.js';
import { PaymentsAdminController, WebhooksController } from './payments.controllers.js';
import { PaymentsService } from './payments.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';
import { FakePaymentProvider } from './providers/fake.provider.js';
import { MercadoPagoPaymentProvider } from './providers/mercadopago.provider.js';

@Module({
  imports: [AdminModule],
  controllers: [WebhooksController, PaymentsAdminController],
  providers: [
    FakePaymentProvider,
    MercadoPagoPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, FakePaymentProvider, MercadoPagoPaymentProvider],
      // PAYMENT_PROVIDER=fake em produção nem chega aqui: o env falha no boot (SEC-036).
      useFactory: (config: ConfigService<Env, true>, fake: FakePaymentProvider, mp: MercadoPagoPaymentProvider): PaymentProvider =>
        config.get('PAYMENT_PROVIDER', { infer: true }) === 'mercadopago' ? mp : fake,
    },
    PaymentsService,
  ],
  exports: [PaymentsService, FakePaymentProvider, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
