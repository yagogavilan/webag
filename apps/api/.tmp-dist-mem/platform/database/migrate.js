import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle');
/** Aplica as migrações pendentes. Idempotente (plano de execução §1, item 5). */
export async function runMigrations(databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
        await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
    }
    finally {
        await pool.end();
    }
}
// Execução direta: `pnpm --filter @webag/api db:migrate`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('DATABASE_URL não definida');
        process.exit(1);
    }
    runMigrations(url)
        .then(() => console.log('Migrações aplicadas'))
        .catch((error) => {
        console.error('Falha na migração:', error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate.js.map