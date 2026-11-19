import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { initSentry } from './platform/observability/sentry.js';
async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    configureApp(app);
    const config = app.get(ConfigService);
    // DT-039: sem SENTRY_DSN fica desligado. Ligado depois da validação do env; `ProblemFilter` envia os erros 5xx.
    initSentry({
        dsn: config.get('SENTRY_DSN', { infer: true }),
        environment: config.get('APP_ENV', { infer: true }) ?? config.get('NODE_ENV', { infer: true }),
        tracesSampleRate: config.get('SENTRY_TRACES_SAMPLE_RATE', { infer: true }),
    });
    await app.listen(config.get('API_PORT', { infer: true }), '0.0.0.0');
}
void bootstrap();
//# sourceMappingURL=main.js.map