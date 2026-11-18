import { defineConfig } from 'vitest/config';

// Testes de integração/E2E de API (ADR-006): test/**/*.e2e-spec.ts, com PostgreSQL e Redis REAIS.
// Padrões apontam para o docker compose local; o CI sobrescreve por variável de ambiente.
// O banco de teste é um banco próprio (`<db>_test`) recriado e migrado do zero a cada execução,
// para nunca tocar nos dados de desenvolvimento.
const baseUrl = process.env.DATABASE_URL ?? 'postgresql://webag:webag_dev_only@localhost:5432/webag';
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${testUrl.pathname.replace(/^\//, '')}_test`.replace(/(_test)+$/, '_test');

// Redis: banco lógico 15 (o de desenvolvimento usa o 0).
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/15';

export const TEST_ADMIN_DATABASE_URL = baseUrl;

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Arquivos em série: compartilham o mesmo banco e o mesmo Redis.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent',
      DATABASE_URL: testUrl.toString(),
      WEBAG_ADMIN_DATABASE_URL: baseUrl,
      REDIS_URL: redisUrl.toString(),
      TRUST_PROXY: '1',
      // Mais rápido nos testes que exercitam o fluxo de retry de rede; o comportamento é o mesmo.
      REFRESH_REUSE_WINDOW_SECONDS: '30',
    },
  },
});
