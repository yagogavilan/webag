import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { stdSerializers } from 'pino';
import { startTime } from 'pino-http';
import { LoggerModule } from 'nestjs-pino';
import { maskCoordinates, maskTokenPaths } from './platform/logging/mask.js';
import { HealthModule } from './health/health.module.js';
import { APP_FILTER } from '@nestjs/core';
import { LOG_REDACT_PATHS } from './platform/logging/redact.js';
import { AdminModule } from './modules/admin/index.js';
import { BackofficeModule } from './modules/backoffice/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { MediaModule } from './modules/media/index.js';
import { CatalogModule } from './modules/catalog/index.js';
import { StoresModule } from './modules/stores/index.js';
import { AddressesModule } from './modules/addresses/index.js';
import { CampaignsModule } from './modules/campaigns/index.js';
import { CartModule } from './modules/cart/index.js';
import { devOrderModulesFor, OrdersModule } from './modules/orders/index.js';
import { ExchangesModule } from './modules/exchanges/index.js';
import { NotificationsModule } from './modules/notifications/index.js';
import { RealtimeModule } from './modules/realtime/index.js';
import { FeedbackModule } from './modules/feedback/index.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { MarketingModule } from './modules/marketing/index.js';
import { PrivacyModule } from './modules/privacy/index.js';
import { LogisticsModule } from './modules/logistics/index.js';
import { FinanceModule } from './modules/finance/index.js';
import { IdempotencyModule } from './modules/idempotency/index.js';
import { DiscoveryModule } from './modules/discovery/index.js';
import { CacheModule } from './platform/cache/cache.module.js';
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
              return { ...out, url: maskTokenPaths(maskCoordinates(out.url)) };
            },
          },
          // Nunca logar credenciais (skill padroes-backend).
          redact: { paths: [...LOG_REDACT_PATHS], censor: '[redacted]' },
          autoLogging: {
            ignore: (req) => req.url?.startsWith('/health') ?? false,
          },
          // Desempenho: o log de acesso de TODA requisição bem-sucedida custa ~10% da CPU da API (escrita síncrona de ~1 KB por requisição) e duplica o log do nginx
          // (IP, rota, status e tempo). Em `slow` (padrão) só vão para o log (nível info): erro 5xx/4xx e requisição lenta (>= HTTP_SLOW_MS); o resto sai em debug (liga
          // com LOG_LEVEL=debug). `HTTP_ACCESS_LOG=all` volta ao comportamento anterior. A latência por rota continua no resumo `http.latency` (platform/observability/latency.ts).
          customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            if (config.get('HTTP_ACCESS_LOG', { infer: true }) === 'all') return 'info';
            const started = (res as unknown as Record<symbol, number | undefined>)[startTime];
            return started !== undefined && Date.now() - started >= config.get('HTTP_SLOW_MS', { infer: true }) ? 'info' : 'debug';
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
    CampaignsModule,
    CartModule,
    OrdersModule,
    ExchangesModule,
    RealtimeModule,
    NotificationsModule,
    LogisticsModule,
    FinanceModule,
    PrivacyModule,
    MarketingModule,
    ReportsModule,
    FeedbackModule,
    BackofficeModule,
    // Simulação de pagamento: fora de produção apenas (SEC-036).
    ...devModulesFor(process.env.NODE_ENV),
    ...devOrderModulesFor(process.env.NODE_ENV),
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
})
export class AppModule {}
