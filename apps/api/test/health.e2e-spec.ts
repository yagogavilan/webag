import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PG_POOL } from '../src/platform/database/database.module.js';
import { REDIS } from '../src/platform/redis/redis.module.js';

/** Porta 1: nada escuta nela, a conexão é recusada na hora (dependência "fora do ar"). */
const UNREACHABLE_PG = 'postgresql://nobody:nothing@127.0.0.1:1/none';
const UNREACHABLE_REDIS = 'redis://127.0.0.1:1';

async function createApp(
  overrides: { pool?: pg.Pool; redis?: Redis } = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (overrides.pool) builder = builder.overrideProvider(PG_POOL).useValue(overrides.pool);
  if (overrides.redis) builder = builder.overrideProvider(REDIS).useValue(overrides.redis);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

describe('GET /health (liveness)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('responde 200 sem consultar dependências e devolve x-request-id', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it('reaproveita x-request-id válido e troca o inválido', async () => {
    const valid = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'abc12345-proxy');
    const invalid = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'ruim<script>');

    expect(valid.headers['x-request-id']).toBe('abc12345-proxy');
    expect(invalid.headers['x-request-id']).not.toContain('ruim');
  });

  it('serve o contrato em /docs/openapi.json', async () => {
    const response = await request(app.getHttpServer()).get('/docs/openapi.json').expect(200);

    expect(response.body).toHaveProperty(['paths', '/health']);
  });
});

describe('GET /health/ready com dependências fora do ar', () => {
  let app: NestExpressApplication;
  const pool = new pg.Pool({ connectionString: UNREACHABLE_PG, connectionTimeoutMillis: 500 });
  const redis = new Redis(UNREACHABLE_REDIS, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);

  beforeAll(async () => {
    app = await createApp({ pool, redis });
  });
  afterAll(async () => {
    await app.close();
  });

  it('responde 503 no formato do contrato, apontando cada dependência', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      error: { database: { status: 'down' }, redis: { status: 'down' } },
    });
  });

  it('não expõe host, porta, usuário nem a mensagem do driver (endpoint público)', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    const text = JSON.stringify(response.body);

    expect(text).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|nobody|localhost|:1\b|timeout/i);
    expect(response.body.error.database.message).toBe('indisponível');
    expect(response.body.error.redis.message).toBe('indisponível');
  });
});

// Precisa de PostgreSQL e Redis reais (docker compose up -d postgres redis, ou services do CI).
describe.runIf(process.env.E2E_DEPS === '1')('GET /health/ready com dependências no ar', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('responde 200 com database e redis up', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });
});
