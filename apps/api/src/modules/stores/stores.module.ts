import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../platform/config/env.js';
import { AdminModule } from '../admin/index.js';
import { IdentityModule } from '../identity/index.js';
import { MediaModule } from '../media/index.js';
import { PaymentsModule } from '../payments/index.js';
import { AdminStoresController } from './admin-stores.controller.js';
import { AdminStoresService } from './admin-stores.service.js';
import { FakeGeocodingProvider, GEOCODING_PROVIDER, HttpGeocodingProvider } from './geocoding.js';
import { FakePaymentOAuthProvider, MercadoPagoOAuthProvider, PAYMENT_OAUTH_PROVIDER, PaymentAccountService } from './payment-account.service.js';
import { StoreSettingsService } from './store-settings.service.js';
import { CepController, StorePaymentController, StoreTeamController, StoresController } from './stores.controllers.js';
import { StoresService } from './stores.service.js';
import { TeamService } from './team.service.js';

@Module({
  imports: [AdminModule, IdentityModule, MediaModule, PaymentsModule],
  controllers: [StoresController, CepController, StorePaymentController, StoreTeamController, AdminStoresController],
  providers: [
    StoresService,
    StoreSettingsService,
    PaymentAccountService,
    TeamService,
    AdminStoresService,
    FakeGeocodingProvider,
    HttpGeocodingProvider,
    FakePaymentOAuthProvider,
    MercadoPagoOAuthProvider,
    {
      provide: GEOCODING_PROVIDER,
      inject: [ConfigService, FakeGeocodingProvider, HttpGeocodingProvider],
      useFactory: (config: ConfigService<Env, true>, fake: FakeGeocodingProvider, http: HttpGeocodingProvider) => (config.get('GEOCODING_PROVIDER', { infer: true }) === 'http' ? http : fake),
    },
    {
      provide: PAYMENT_OAUTH_PROVIDER,
      inject: [ConfigService, FakePaymentOAuthProvider, MercadoPagoOAuthProvider],
      useFactory: (config: ConfigService<Env, true>, fake: FakePaymentOAuthProvider, mp: MercadoPagoOAuthProvider) => (config.get('PAYMENT_PROVIDER', { infer: true }) === 'mercadopago' ? mp : fake),
    },
  ],
  exports: [StoresService, StoreSettingsService, TeamService, GEOCODING_PROVIDER],
})
export class StoresModule {}
