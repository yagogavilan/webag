import { defineConfig } from 'vitest/config';

// Testes unitários (ADR-006): src/**/*.spec.ts
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
});
