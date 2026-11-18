import { defineConfig } from 'vitest/config';

// Testes E2E de API (ADR-006): test/**/*.e2e-spec.ts
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
  },
});
