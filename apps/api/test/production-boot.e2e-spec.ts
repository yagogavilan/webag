import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { vi } from 'vitest';
import { TEST_ENV } from './test-env.js';

/**
 * SEC-036 / SEC-080: em produção o módulo /v1/dev/* nem é registrado (404, não 403), o provedor fake não sobe e
 * configuração insegura derruba o boot. Cada caso importa o AppModule de novo com o NODE_ENV desejado.
 */
describe('Boot em produção (SEC-036, SEC-080)', () => {
  const saved = { ...process.env };
  const productionEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: TEST_ENV.databaseUrl,
    REDIS_URL: TEST_ENV.redisUrl,
    JWT_ACCESS_SECRET: 'a-very-long-random-production-secret-0123456789',
    AUTH_HMAC_KEY: 'another-very-long-random-production-hmac-key-9876543210',
    CODE_HMAC_KEY: 'code-hmac-very-long-random-production-key-1111111111',
    RECOVERY_HMAC_KEY: 'recovery-hmac-very-long-random-production-key-2222222',
    MFA_ENC_KEY: 'yet-another-very-long-random-production-mfa-key-1234567890',
    TRUST_PROXY: '1',
    BFF_SHARED_SECRET: 'bff-shared-very-long-random-production-secret-5555555',
    STORAGE_DRIVER: 's3',
    S3_ACCESS_KEY: 'prod-access',
    S3_SECRET_KEY: 'prod-secret-long',
    GEOCODING_PROVIDER: 'http',
    CORS_ORIGINS: 'https://app.webag.com.br',
    PAYMENT_PROVIDER: 'mercadopago',
    MP_ACCESS_TOKEN: 'APP_USR-123',
    MP_WEBHOOK_SECRET: 'segredo-do-webhook-123456',
    PAYMENT_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
    LOG_LEVEL: 'silent',
  };

  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  const boot = async (env: Record<string, string>): Promise<NestExpressApplication> => {
    vi.resetModules();
    Object.assign(process.env, env);
    delete process.env.API_DOCS_ENABLED;
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    return app;
  };

  it('/v1/dev/payments/* não existe em produção: 404 (nem 401, nem 403)', async () => {
    const app = await boot(productionEnv);
    try {
      const id = randomUUID();
      await request(app.getHttpServer()).post('/v1/dev/payments').send({ amountCents: 100, method: 'pix' }).expect(404);
      await request(app.getHttpServer()).post(`/v1/dev/payments/${id}/approve`).expect(404);
      await request(app.getHttpServer()).get(`/v1/dev/payments/${id}`).expect(404);
      // /docs desligado em produção por padrão (SEC-080) e o webhook do provedor real continua exigindo assinatura
      await request(app.getHttpServer()).get('/docs/openapi.json').expect(404);
      await request(app.getHttpServer()).post('/v1/webhooks/mercadopago?data.id=1').expect(401);
      const health = await request(app.getHttpServer()).get('/health').expect(200);
      expect(health.headers['strict-transport-security']).toContain('max-age=');
      expect(health.headers['x-content-type-options']).toBe('nosniff');
    } finally {
      await app.close();
    }
  });

  it('NODE_ENV=production com PAYMENT_PROVIDER=fake: o processo não sobe, com erro claro e sem imprimir segredos', async () => {
    let message = '';
    try {
      await boot({ ...productionEnv, PAYMENT_PROVIDER: 'fake' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/PAYMENT_PROVIDER/);
    expect(message).not.toContain(productionEnv.JWT_ACCESS_SECRET);
  });

  it('credencial de teste do Mercado Pago em produção derruba o boot', async () => {
    await expect(boot({ ...productionEnv, MP_ACCESS_TOKEN: 'TEST-abc' })).rejects.toThrow(/MP_ACCESS_TOKEN/);
  });

  it('o adaptador do Mercado Pago ainda não cria pagamento (501 explícito), mas já valida assinatura', async () => {
    const app = await boot(productionEnv);
    try {
      const { PaymentsService } = await import('../src/modules/payments/payments.service.js');
      await expect(app.get(PaymentsService).createPayment({ externalReference: 'x', method: 'pix', amountCents: 1000, storeId: null })).rejects.toMatchObject({
        code: 'MERCADOPAGO_NOT_IMPLEMENTED',
      });
    } finally {
      await app.close();
    }
  });
});
