import { defineConfig } from 'vitest/config';

// Testes unitários do web (ADR-006). E2E dos painéis: Playwright, quando houver telas.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
