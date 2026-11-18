import { defineConfig } from 'vitest/config';

// Testes de integração/E2E de API (ADR-006): test/**/*.e2e-spec.ts, com PostgreSQL e Redis REAIS.
// Padrões apontam para o docker compose local; o CI sobrescreve por variável de ambiente (test/test-env.ts).
import { TEST_ENV } from './test/test-env.js';
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
      DATABASE_URL: TEST_ENV.databaseUrl,
      REDIS_URL: TEST_ENV.redisUrl,
      TRUST_PROXY: '1',
      // Mais rápido nos testes que exercitam o fluxo de retry de rede; o comportamento é o mesmo.
      REFRESH_REUSE_WINDOW_SECONDS: '30',
    },
  },
});
