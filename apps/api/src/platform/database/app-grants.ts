import type pg from 'pg';

/**
 * D-06 (ADR-018 D9, tech-lead B4): a API roda com o papel `webag_app` (sem superusuário, sem DDL) e só o job `migrate` usa o dono
 * (`webag_migrator`). Este passo roda DEPOIS do `migrate()` do Drizzle, fora da transação dele, e é idempotente: reafirma os
 * privilégios do `webag_app` sobre as tabelas que existem agora. Assim nenhuma migração precisa lembrar de dar `GRANT`, e a lista
 * de tabelas append-only (abaixo) é a única exceção, guardada por teste contra os gatilhos das migrações.
 *
 * Sem o papel `webag_app` (desenvolvimento local sem o init de papéis, CI antigo) o passo é ignorado, e isto é dito no log.
 * Quem cria os papéis, as extensões e a posse dos objetos é `infra/postgres/30-roles-create.sh` e `40-roles-grants.sql`, como superusuário: o Drizzle
 * não consegue (e não deve) criar papel dentro de migração.
 */
export const APP_ROLE = 'webag_app';

/**
 * Tabelas append-only: o `webag_app` só faz `INSERT` e `SELECT`. Mesmo um gatilho desligado por engano não permite alterar ou
 * apagar histórico, e o `ALTER TABLE ... DISABLE TRIGGER` exige ser dono. Todo `CREATE TRIGGER *_append_only` ou `*_immutable`
 * novo entra aqui (o `app-grants.spec.ts` falha se esta lista divergir das migrações).
 */
export const APPEND_ONLY_TABLES = [
  'audit_log',
  'consents',
  'delivery_events',
  'ledger_entries',
  'ledger_transactions',
  'legal_documents',
  'parameter_history',
  'payment_refunds',
  'terms_acceptances',
] as const;

/**
 * Exceção deliberada à regra acima (SEC-159, migração 0039/0047): a anonimização trunca o `ip` (e a `platform`) dos aceites e dos
 * consentimentos, e o gatilho `webag_allow_ip_truncation` só deixa passar essa mudança. O papel recebe `UPDATE` SÓ nessas colunas.
 */
export const APPEND_ONLY_COLUMN_UPDATES: Readonly<Record<string, readonly string[]>> = {
  terms_acceptances: ['ip', 'platform'],
  consents: ['ip'],
};

export function appGrantsSql(): string {
  const tables = APPEND_ONLY_TABLES.map((t) => `'${t}'`).join(', ');
  const columnGrants = Object.entries(APPEND_ONLY_COLUMN_UPDATES)
    .map(([table, columns]) => `GRANT UPDATE (${columns.join(', ')}) ON TABLE public.${table} TO ${APP_ROLE};`)
    .join('\n');
  return `
GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tbl
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO ${APP_ROLE}', r.tbl);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM ${APP_ROLE}', r.tbl);
  END LOOP;
END
$do$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[${tables}] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM ${APP_ROLE}', t);
    END IF;
  END LOOP;
END
$do$;
${columnGrants}
GRANT USAGE ON SCHEMA drizzle TO ${APP_ROLE};
GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO ${APP_ROLE};
`;
}

export type AppGrantsResult = 'applied' | 'skipped';

/** `db` é o pool do `migrate` (conectado como dono). Retorna `skipped` quando o papel `webag_app` não existe no cluster. */
export async function applyAppGrants(db: Pick<pg.Pool, 'query'>): Promise<AppGrantsResult> {
  const role = await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE]);
  if (role.rows.length === 0) return 'skipped';
  await db.query(appGrantsSql());
  return 'applied';
}
