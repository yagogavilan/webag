import { defineConfig } from 'orval';

// Fonte da verdade: docs/arquitetura/api/openapi.yaml (ADR-007).
// O código gerado é versionado; o CI falha se `pnpm generate` produzir diff.
const input = { target: '../../docs/arquitetura/api/openapi.yaml' };

export default defineConfig({
  // Tipos + funções fetch (sem dependência de framework; servem web, mobile e testes da API).
  client: {
    input,
    output: {
      mode: 'single',
      target: './src/generated/client.ts',
      client: 'fetch',
      clean: false,
      prettier: false,
    },
  },
  // Schemas Zod para validar entrada na API e formulários nos apps.
  zod: {
    input,
    output: {
      mode: 'single',
      target: './src/generated/zod.ts',
      client: 'zod',
      clean: false,
      prettier: false,
    },
  },
});
