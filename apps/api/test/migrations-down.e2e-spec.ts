import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../src/platform/database/migrate.js';
import { TEST_ENV } from './test-env.js';

/**
 * I3 (review R1.1) / regra 5 do modelo de dados: os scripts `drizzle/down/0058..0061.sql` funcionam. Num banco descartável: aplica do zero (como o job `migrate`),
 * insere dados, reverte 0061, 0060, 0059 e 0058 (nessa ordem, cada uma numa transação, como `psql -1`), confere que a estrutura saiu e que as linhas das
 * tabelas que sobrevivem continuam, e reaplica tudo (o registro do Drizzle foi apagado pelo próprio script). Com os papéis, roda como `webag_migrator`.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRANTS_SQL = path.resolve(ROOT, '../../infra/postgres/40-roles-grants.sql');
const DOWNS = ['0061', '0060', '0059', '0058'];
const scratch = `${(process.env.TEST_DB_NAME ?? 'webag_test').replace(/_test$/, '')}_down_test`;

const urlFor = (base: string): string => {
  const url = new URL(base);
  url.pathname = `/${scratch}`;
  return url.toString();
};

async function withClient<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

describe('reversão das migrações 0058 a 0061 (I3)', () => {
  let rolesReady = false;
  const runnerUrl = () => (rolesReady ? urlFor(TEST_ENV.migratorDatabaseUrl) : urlFor(TEST_ENV.adminDatabaseUrl));

  beforeAll(async () => {
    await withClient(TEST_ENV.adminDatabaseUrl, async (admin) => {
      rolesReady = (await admin.query(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('webag_migrator', 'webag_app')`)).rows[0].n === 2;
      await admin.query(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${scratch}"`);
    });
    if (rolesReady) await withClient(urlFor(TEST_ENV.adminDatabaseUrl), (c) => c.query(readFileSync(GRANTS_SQL, 'utf8')));
    else await withClient(urlFor(TEST_ENV.adminDatabaseUrl), (c) => c.query('CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;'));
    await runMigrations(runnerUrl());
  }, 120_000);

  afterAll(async () => {
    await withClient(TEST_ENV.adminDatabaseUrl, (admin) => admin.query(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`));
  });

  const structure = (c: pg.Client) =>
    c
      .query<{ k: string }>(
        `SELECT 'col:' || table_name || '.' || column_name AS k FROM information_schema.columns
          WHERE (table_name, column_name) IN (('stores','version'),('audit_log','store_id'),('products','version'),('products','via'),('products','created_by_admin_id'),('products','duplicated_from'),('categories','template'),('categories','description_required'),('categories','description_min_chars'))
         UNION ALL SELECT 'table:' || table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('admin_view_sessions','store_admin_changes','store_change_digest','product_creation_metrics')
         UNION ALL SELECT 'index:' || indexname FROM pg_indexes WHERE indexname IN ('audit_log_store_at_idx','products_store_drafts_idx')
         UNION ALL SELECT 'check:' || conname FROM pg_constraint WHERE conname IN ('products_name_len','products_version_positive','products_via_valid')
         ORDER BY 1`,
      )
      .then((r) => r.rows.map((x) => x.k));
  const counts = (c: pg.Client) =>
    c
      .query<{ u: number; s: number; a: number; p: number }>(
        `SELECT (SELECT count(*) FROM users)::int AS u, (SELECT count(*) FROM stores)::int AS s, (SELECT count(*) FROM audit_log)::int AS a, (SELECT count(*) FROM products)::int AS p`,
      )
      .then((r) => r.rows[0]);
  const journalRows = (c: pg.Client) => c.query<{ n: number }>(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`).then((r) => r.rows[0]!.n);

  it('aplica do zero, reverte 0061 a 0058 sem perder as linhas que sobrevivem e reaplica', async () => {
    const url = runnerUrl();
    await withClient(url, async (c) => {
      const full = await structure(c);
      expect(full).toHaveLength(9 + 4 + 2 + 3);
      const totalJournal = await journalRows(c);

      // Dados "de produção": usuário, loja (versão), produto (rascunho), linha de auditoria com store_id.
      const { rows } = await c.query<{ id: string }>(`INSERT INTO users (email, name) VALUES ('down-test@example.invalid', 'Down Test') RETURNING id`);
      const userId = rows[0]!.id;
      const store = await c.query<{ id: string }>(`INSERT INTO stores (owner_user_id, document_type, document_number) VALUES ($1, 'cpf', '00000000000') RETURNING id`, [userId]);
      const storeId = store.rows[0]!.id;
      await c.query(`INSERT INTO products (store_id, name, status) VALUES ($1, '', 'draft')`, [storeId]);
      await c.query(`INSERT INTO audit_log (action, store_id) VALUES ('down.test', $1)`, [storeId]);
      await c.query(`INSERT INTO store_admin_changes (store_id, type, summary, reason_label) VALUES ($1, 'profile', 's', 'r')`, [storeId]);
      const before = await counts(c);
      expect(before).toEqual({ u: 1, s: 1, a: 1, p: 1 });

      for (const n of DOWNS) {
        await c.query('BEGIN');
        try {
          await c.query(readFileSync(path.join(ROOT, 'drizzle/down', `${n}.sql`), 'utf8'));
          await c.query('COMMIT');
        } catch (error) {
          await c.query('ROLLBACK');
          throw new Error(`down/${n}.sql falhou: ${(error as Error).message}`);
        }
      }
      expect(await structure(c)).toEqual([]);
      expect(await counts(c)).toEqual(before); // linhas de users, stores, audit_log (append-only) e products intactas
      expect(await journalRows(c)).toBe(totalJournal - DOWNS.length);

      // Reversão é repetível: rodar de novo não falha (IF EXISTS).
      for (const n of DOWNS) await c.query(readFileSync(path.join(ROOT, 'drizzle/down', `${n}.sql`), 'utf8'));
    });

    // Reaplica: o migrator volta a achar as quatro pendentes.
    await runMigrations(url);
    await withClient(url, async (c) => {
      expect(await structure(c)).toHaveLength(9 + 4 + 2 + 3);
      expect(await counts(c)).toEqual({ u: 1, s: 1, a: 1, p: 1 });
      expect((await c.query(`SELECT version FROM stores`)).rows[0].version).toBe(1); // coluna recriada com o default
    });
  }, 120_000);
});
