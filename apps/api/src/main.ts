import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './platform/config/env.js';
import { initSentry } from './platform/observability/sentry.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // DT-039: sem SENTRY_DSN fica desligado. Ligado depois da validação do env; `ProblemFilter` envia os erros 5xx.
  initSentry({
    dsn: config.get('SENTRY_DSN', { infer: true }),
    environment: config.get('APP_ENV', { infer: true }) ?? config.get('NODE_ENV', { infer: true }),
    tracesSampleRate: config.get('SENTRY_TRACES_SAMPLE_RATE', { infer: true }),
  });
  // Atrás do nginx com conexões reutilizadas (upstream keepalive) o Node precisa manter a conexão ociosa por MAIS tempo que o proxy (padrão 5 s derruba no meio e vira 502).
  const server = app.getHttpServer() as { keepAliveTimeout: number; headersTimeout: number };
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  await app.listen(config.get('API_PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
