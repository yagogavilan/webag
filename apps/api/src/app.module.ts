import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { stdSerializers } from 'pino';
import { LoggerModule } from 'nestjs-pino';
import { maskCoordinates } from './platform/logging/mask.js';
import { HealthModule } from './health/health.module.js';
import { APP_FILTER } from '@nestjs/core';
import { AdminModule } from './modules/admin/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { MediaModule } from './modules/media/index.js';
import { CatalogModule } from './modules/catalog/index.js';
import { StoresModule } from './modules/stores/index.js';
import { AddressesModule } from './modules/addresses/index.js';
import { CartModule } from './modules/cart/index.js';
import { OrdersModule } from './modules/orders/index.js';
import { ExchangesModule } from './modules/exchanges/index.js';
import { LogisticsModule } from './modules/logistics/index.js';
import { FinanceModule } from './modules/finance/index.js';
import { IdempotencyModule } from './modules/idempotency/index.js';
import { DiscoveryModule } from './modules/discovery/index.js';
import { CacheModule } from './platform/cache/cache.service.js';
import { StorageModule } from './platform/storage/storage.module.js';
import { devModulesFor, PaymentsModule } from './modules/payments/index.js';
import { UsersModule } from './modules/users/index.js';
import { ProblemFilter } from './platform/http/problem.filter.js';
import { MailModule } from './platform/mail/mail.module.js';
import { RateLimitModule } from './platform/ratelimit/rate-limit.module.js';
import { validateEnv, type Env } from './platform/config/env.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { RedisModule } from './platform/redis/redis.module.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // cwd = apps/api quando rodado via pnpm/turbo; o .env fica na raiz do monorepo.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // requestId: reaproveita o do proxy se for válido; senão gera um.
          genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id =
              typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
                ? incoming
                : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          // LGPD: a posição do cliente (lat/lng na URL de descoberta) não entra no log de acesso.
          serializers: {
            req: (req: Parameters<typeof stdSerializers.req>[0]) => {
              const out = stdSerializers.req(req);
              return { ...out, url: maskCoordinates(out.url) };
            },
          },
          // Nunca logar credenciais (skill padroes-backend).
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-webag-bff-secret"]',
              'res.headers["set-cookie"]',
              'req.body',
            ],
            censor: '[redacted]',
          },
          autoLogging: {
            ignore: (req) => req.url?.startsWith('/health') ?? false,
          },
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    DatabaseModule,
    IdempotencyModule,
    RedisModule,
    CacheModule,
    MailModule,
    RateLimitModule,
    HealthModule,
    AdminModule,
    UsersModule,
    IdentityModule,
    PaymentsModule,
    StorageModule,
    MediaModule,
    StoresModule,
    CatalogModule,
    AddressesModule,
    DiscoveryModule,
    CartModule,
    OrdersModule,
    ExchangesModule,
    LogisticsModule,
    FinanceModule,
    // Simulação de pagamento: fora de produção apenas (SEC-036).
    ...devModulesFor(process.env.NODE_ENV),
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
})
export class AppModule {}
