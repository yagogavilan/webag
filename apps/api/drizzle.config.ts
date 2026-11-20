import { defineConfig } from 'drizzle-kit';

// Migrações versionadas em apps/api/drizzle (nada de alterar o banco na mão — regra do time).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://webag:webag_dev_only@localhost:5432/webag',
  },
  casing: 'snake_case',
});
