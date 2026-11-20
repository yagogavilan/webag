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
      // O e2e tem PostgreSQL e Redis reais: liga o teste de /health/ready com dependências no ar (antes ficava pulado sem esta variável).
      E2E_DEPS: '1',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent',
      DATABASE_URL: TEST_ENV.databaseUrl,
      REDIS_URL: TEST_ENV.redisUrl,
      TRUST_PROXY: '1',
      // A-01: hosts de cada painel DIFERENTES nos e-mails (admin x lojista x site público); os testes fixam qual link usa qual host.
      ADMIN_WEB_URL: 'http://admin.webag.test',
      LOJISTA_WEB_URL: 'http://lojista.webag.test',
      WEB_PUBLIC_URL: 'http://www.webag.test',
      BFF_SHARED_SECRET: 'test-bff-shared-secret-0123456789abcdef',
      STORAGE_DRIVER: 'memory',
      // Mais rápido nos testes que exercitam o fluxo de retry de rede; o comportamento é o mesmo.
      REFRESH_REUSE_WINDOW_SECONDS: '30',
    },
  },
});
