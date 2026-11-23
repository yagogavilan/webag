import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../src/platform/database/migrate.js';
import { TEST_ENV } from './test-env.js';

/**
 * I3 (review R1.1) / regra 5 do modelo de dados: os scripts `drizzle/down/0058..0065.sql` funcionam (0064 e 0065 são da v1.1 R2, ADR-019). Num banco descartável: aplica do zero (como o job `migrate`),
 * insere dados, reverte 0065, 0064, 0063, 0062, 0061, 0060, 0059 e 0058 (nessa ordem, cada uma numa transação, como `psql -1`), confere que a estrutura saiu e que as linhas das
 * tabelas que sobrevivem continuam, e reaplica tudo (o registro do Drizzle foi apagado pelo próprio script). Com os papéis, roda como `webag_migrator`.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRANTS_SQL = path.resolve(ROOT, '../../infra/postgres/40-roles-grants.sql');
const DOWNS = ['0065', '0064', '0063', '0062', '0061', '0060', '0059', '0058'];
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

describe('reversão das migrações 0058 a 0065 (I3)', () => {
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
          WHERE (table_name, column_name) IN (('stores','version'),('audit_log','store_id'),('products','version'),('products','via'),('products','created_by_admin_id'),('products','duplicated_from'),('categories','template'),('categories','description_required'),('categories','description_min_chars'),('coupons','campaign_id'),('coupons','visibility'),('coupons','code_origin'),('orders','campaign_id'),('orders','coupon_snapshot'))
         UNION ALL SELECT 'table:' || table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('admin_view_sessions','store_admin_changes','store_change_digest','product_creation_metrics','product_bulk_batches','product_bulk_batch_items','campaigns','campaign_store_enrollments','campaign_acceptances','campaign_budget_days','campaign_store_months','coupon_reservations','campaign_budget_entries','coupon_fraud_claims','coupon_identifier_sightings','coupon_fraud_signals','analytics_interest','product_barcodes','product_price_history','reference_barcodes','dashboard_daily_facts','dashboard_distinct_daily','dashboard_item_facts','dashboard_refresh_state','dashboard_widgets','dashboards')
         UNION ALL SELECT 'fn:' || proname FROM pg_proc WHERE proname = 'campaign_budget_violations'
         UNION ALL SELECT 'index:' || indexname FROM pg_indexes WHERE indexname IN ('audit_log_store_at_idx','products_store_drafts_idx','product_moderation_events_product_idx','product_bulk_batches_store_idx','product_bulk_batch_items_product_idx','orders_campaign_idx','coupons_campaign_idx','product_price_history_open_uq')
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

  it('aplica do zero, reverte 0063 a 0058 sem perder as linhas que sobrevivem e reaplica', async () => {
    const url = runnerUrl();
    await withClient(url, async (c) => {
      const full = await structure(c);
      expect(full).toHaveLength(14 + 26 + 8 + 3 + 1); // colunas, tabelas, índices, CHECKs e a função de invariante
      const totalJournal = await journalRows(c);

      // Dados "de produção": usuário, loja (versão), produto (rascunho), linha de auditoria com store_id.
      const { rows } = await c.query<{ id: string }>(`INSERT INTO users (email, name) VALUES ('down-test@example.invalid', 'Down Test') RETURNING id`);
      const userId = rows[0]!.id;
      const store = await c.query<{ id: string }>(`INSERT INTO stores (owner_user_id, document_type, document_number) VALUES ($1, 'cpf', '00000000000') RETURNING id`, [userId]);
      const storeId = store.rows[0]!.id;
      const draftId = (await c.query<{ id: string }>(`INSERT INTO products (store_id, name, status) VALUES ($1, '', 'draft') RETURNING id`, [storeId])).rows[0]!.id;
      // BUG-042 (0062): apagar o rascunho com evento de moderação passa e o evento sobrevive com `product_id` nulo; a reversão tira o órfão e devolve a FK.
      await c.query(`INSERT INTO product_moderation_events (product_id, store_id, action) VALUES ($1, $2, 'remove')`, [draftId, storeId]);
      await c.query(`DELETE FROM products WHERE id = $1`, [draftId]);
      expect((await c.query(`SELECT count(*)::int AS n FROM product_moderation_events WHERE product_id IS NULL`)).rows[0].n).toBe(1);
      await c.query(`INSERT INTO products (store_id, name, status) VALUES ($1, '', 'draft')`, [storeId]);
      await c.query(`INSERT INTO audit_log (action, store_id) VALUES ('down.test', $1)`, [storeId]);
      await c.query(`INSERT INTO store_admin_changes (store_id, type, summary, reason_label) VALUES ($1, 'profile', 's', 'r')`, [storeId]);
      // 0063: lote de ação em massa (some com a reversão; o `audit_log` e os produtos ficam).
      const batchId = (await c.query<{ id: string }>(`INSERT INTO product_bulk_batches (store_id, kind, source, actor_user_id, items_count, undo_until) VALUES ($1, 'price_adjust', 'merchant', $2, 1, now()) RETURNING id`, [storeId, userId])).rows[0]!.id;
      const liveProduct = (await c.query<{ id: string }>(`INSERT INTO products (store_id, name, status, base_price_cents) VALUES ($1, 'Produto do lote', 'active', 1000) RETURNING id`, [storeId])).rows[0]!.id;
      await c.query(`INSERT INTO product_bulk_batch_items (batch_id, product_id, previous_version, applied_version, previous_price_cents, applied_price_cents) VALUES ($1, $2, 1, 2, 1000, 1100)`, [batchId, liveProduct]);
      // 0064 e 0065 (v1.1 R2): campanha com reserva e diário, histórico de preço semeado (o produto vivo acima ganha o intervalo `base`), painel salvo. Tudo some com a reversão; `users`, `stores`, `audit_log` e `products` ficam.
      const campaignId = (await c.query<{ id: string }>(`INSERT INTO campaigns (name, funding_source, store_share_pct, kind, value, state, starts_at, ends_at, budget_total_cents, budget_daily_cents, activated_at) VALUES ('Down test', 'webag', 0, 'fixed', 800, 'active', now(), now() + interval '30 days', 10000, 5000, now()) RETURNING id`)).rows[0]!.id;
      await c.query(`INSERT INTO campaign_acceptances (campaign_id, store_id, user_id, action, store_share_pct, terms_version, terms_hash, monthly_cap_cents) VALUES ($1, $2, $3, 'accept', 0, 'v1', $4, 15000)`, [campaignId, storeId, userId, 'a'.repeat(64)]);
      await c.query(`INSERT INTO dashboards (kind, owner_admin_id, name) VALUES ('user', $1, 'Painel de teste')`, [userId]);
      await c.query(`INSERT INTO analytics_interest (store_id, user_id) VALUES ($1, $2)`, [storeId, userId]);
      await c.query(`INSERT INTO "product_price_history" ("product_id", "kind", "price_cents", "actor_kind") VALUES ($1, 'promo', 900, 'merchant')`, [liveProduct]);
      const before = await counts(c);
      expect(before).toEqual({ u: 1, s: 1, a: 1, p: 2 });

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
      expect((await c.query(`SELECT count(*)::int AS n FROM product_moderation_events`)).rows[0].n).toBe(0); // o órfão (produto já apagado) saiu com o NOT NULL
      expect((await c.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'product_moderation_events' AND column_name = 'product_id'`)).rows[0].is_nullable).toBe('NO');
      expect(await counts(c)).toEqual(before); // linhas de users, stores, audit_log (append-only) e products intactas
      expect(await journalRows(c)).toBe(totalJournal - DOWNS.length);

      // Reversão é repetível: rodar de novo não falha (IF EXISTS).
      for (const n of DOWNS) await c.query(readFileSync(path.join(ROOT, 'drizzle/down', `${n}.sql`), 'utf8'));
    });

    // QA r1-1/r1-2: produto legado NÃO rascunho com nome fora de 2 a 80 caracteres não pode derrubar a 0061 (o VALIDATE falharia e desfaria tudo).
    await withClient(url, async (c) => {
      const storeId = (await c.query<{ id: string }>(`SELECT id FROM stores LIMIT 1`)).rows[0]!.id;
      await c.query(`INSERT INTO products (store_id, name, status) VALUES ($1, 'A', 'active')`, [storeId]);
    });

    // Reaplica: o migrator volta a achar as quatro pendentes (e a 0061 deixa o CHECK como NOT VALID, com aviso, por causa do legado).
    await runMigrations(url);
    await withClient(url, async (c) => {
      expect(await structure(c)).toHaveLength(14 + 26 + 8 + 3 + 1);
      expect(await counts(c)).toEqual({ u: 1, s: 1, a: 1, p: 3 });
      expect((await c.query(`SELECT convalidated FROM pg_constraint WHERE conname = 'products_name_len'`)).rows[0].convalidated).toBe(false);
      // Saneado o legado, o VALIDATE passa (o passo do guia de deploy §16).
      await c.query(`UPDATE products SET name = 'Produto legado' WHERE name = 'A'`);
      await c.query(`ALTER TABLE products VALIDATE CONSTRAINT products_name_len`);
      expect((await c.query(`SELECT version FROM stores`)).rows[0].version).toBe(1); // coluna recriada com o default
    });
  }, 120_000);
});
