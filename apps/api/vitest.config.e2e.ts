import { defineConfig } from 'vitest/config';

// Testes E2E de API (ADR-006): test/**/*.e2e-spec.ts
// Padrões apontam para o docker compose local; o CI sobrescreve por variável de ambiente.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://webag:webag_dev_only@localhost:5432/webag',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
  },
});
