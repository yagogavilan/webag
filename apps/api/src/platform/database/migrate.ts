import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { applyAppGrants } from './app-grants.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle');

/**
 * Aplica as migrações pendentes. Idempotente (plano de execução §1, item 5).
 * O `migrate()` do Drizzle roda TODAS as pendentes numa transação só: `CREATE INDEX CONCURRENTLY` e `VACUUM` não cabem nas
 * migrações (tech-lead B4); índice em tabela grande é aplicado à parte, por runbook. Depois dele, e fora dessa transação,
 * reafirma os privilégios do papel `webag_app` (D-06, `app-grants.ts`).
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
    const grants = await applyAppGrants(pool);
    if (grants === 'skipped') console.warn('Papel webag_app ausente: privilégios do app não aplicados (D-06 só vale com os papéis; ver infra/postgres)');
  } finally {
    await pool.end();
  }
}

// Execução direta: `pnpm --filter @webag/api db:migrate`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // D-06: em produção o job usa o DONO (`webag_migrator`) por MIGRATION_DATABASE_URL; a API usa DATABASE_URL (`webag_app`).
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('MIGRATION_DATABASE_URL (ou DATABASE_URL) não definida');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log('Migrações aplicadas'))
    .catch((error: unknown) => {
      console.error('Falha na migração:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
