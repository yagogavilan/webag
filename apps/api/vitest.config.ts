import { defineConfig } from 'vitest/config';

// Testes unitários (ADR-006): src/**/*.spec.ts, seed/**/*.spec.ts e test/helpers/**/*.spec.ts (A1: o validador de contrato dos e2e)
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'seed/**/*.spec.ts', 'test/helpers/**/*.spec.ts'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
});
