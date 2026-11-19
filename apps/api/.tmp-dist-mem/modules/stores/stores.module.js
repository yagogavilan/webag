var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { DeliveryQuoteRegistry } from './delivery-quote.registry.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminModule } from '../admin/index.js';
import { FinanceModule } from '../finance/index.js';
import { IdentityModule } from '../identity/index.js';
import { MediaModule } from '../media/index.js';
import { PaymentsModule } from '../payments/index.js';
import { AdminStoresController } from './admin-stores.controller.js';
import { AdminStoresService } from './admin-stores.service.js';
import { AdminExposureController, StoreExposureController } from './exposure-limit.controllers.js';
import { ExposureLimitService } from './exposure-limit.service.js';
import { FakeGeocodingProvider, GEOCODING_PROVIDER, HttpGeocodingProvider } from './geocoding.js';
import { FakePaymentOAuthProvider, MercadoPagoOAuthProvider, PAYMENT_OAUTH_PROVIDER, PaymentAccountService } from './payment-account.service.js';
import { StoreSettingsService } from './store-settings.service.js';
import { CepController, StorePaymentController, StoreTeamController, StoresController } from './stores.controllers.js';
import { StoresService } from './stores.service.js';
import { TeamService } from './team.service.js';
let StoresModule = class StoresModule {
};
StoresModule = __decorate([
    Module({
        imports: [AdminModule, FinanceModule, IdentityModule, MediaModule, PaymentsModule],
        controllers: [StoresController, CepController, StorePaymentController, StoreTeamController, AdminStoresController, StoreExposureController, AdminExposureController],
        providers: [
            DeliveryQuoteRegistry,
            StoresService,
            StoreSettingsService,
            PaymentAccountService,
            TeamService,
            AdminStoresService,
            ExposureLimitService,
            FakeGeocodingProvider,
            HttpGeocodingProvider,
            FakePaymentOAuthProvider,
            MercadoPagoOAuthProvider,
            {
                provide: GEOCODING_PROVIDER,
                inject: [ConfigService, FakeGeocodingProvider, HttpGeocodingProvider],
                useFactory: (config, fake, http) => (config.get('GEOCODING_PROVIDER', { infer: true }) === 'http' ? http : fake),
            },
            {
                provide: PAYMENT_OAUTH_PROVIDER,
                inject: [ConfigService, FakePaymentOAuthProvider, MercadoPagoOAuthProvider],
                useFactory: (config, fake, mp) => (config.get('PAYMENT_PROVIDER', { infer: true }) === 'mercadopago' ? mp : fake),
            },
        ],
        exports: [StoresService, DeliveryQuoteRegistry, ExposureLimitService, StoreSettingsService, TeamService, GEOCODING_PROVIDER],
    })
], StoresModule);
export { StoresModule };
//# sourceMappingURL=stores.module.js.map