import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../src/platform/database/schema.js';
import { seedOnda1 } from './onda1.js';

/**
 * Seed de desenvolvimento: `pnpm --filter @webag/api db:seed`. Idempotente. Cada onda soma um arquivo aqui.
 * Em produção só cria o admin se SEED_ADMIN_PASSWORD estiver definida de propósito.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    await seedOnda1(db, {
      adminEmail: process.env.SEED_ADMIN_EMAIL,
      adminPassword: process.env.SEED_ADMIN_PASSWORD,
      log: (message) => console.log(`[seed] ${message}`),
    });
    console.log('[seed] concluído');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] falhou:', error instanceof Error ? error.message : error);
  process.exit(1);
});
