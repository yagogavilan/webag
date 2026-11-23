import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APPEND_ONLY_COLUMN_UPDATES, APPEND_ONLY_TABLES, APP_ROLE, NO_DELETE_TABLES, appGrantsSql, applyAppGrants } from './app-grants.js';

const DRIZZLE_DIR = fileURLToPath(new URL('../../../drizzle', import.meta.url));

/** Tabelas com gatilho `*_append_only` ou `*_immutable` (BEFORE UPDATE OR DELETE) nas migrações, lidas do SQL versionado. */
function appendOnlyTablesFromMigrations(): string[] {
  const found = new Set<string>();
  const pattern = /CREATE TRIGGER\s+"?(\w+)"?\s+BEFORE UPDATE OR DELETE ON\s+"?(\w+)"?/gi;
  for (const file of readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith('.sql'))) {
    for (const match of readFileSync(`${DRIZZLE_DIR}/${file}`, 'utf8').matchAll(pattern)) {
      if (/(append_only|immutable)$/.test(match[1]!)) found.add(match[2]!);
    }
  }
  return [...found].sort();
}

describe('D-06: privilégios do papel da API (app-grants)', () => {
  it('a lista de tabelas append-only é exatamente a dos gatilhos das migrações (tabela nova sem entrar aqui falha)', () => {
    expect([...APPEND_ONLY_TABLES].sort()).toEqual(appendOnlyTablesFromMigrations());
  });

  it('as exceções de coluna só existem para tabelas append-only e só para o truncamento de IP e plataforma (SEC-159)', () => {
    for (const table of Object.keys(APPEND_ONLY_COLUMN_UPDATES)) expect(APPEND_ONLY_TABLES).toContain(table);
    expect(APPEND_ONLY_COLUMN_UPDATES).toEqual({ terms_acceptances: ['ip', 'platform'], consents: ['ip'] });
  });

  it('nunca concede TRUNCATE, DDL, posse nem superusuário, e dá SELECT só na tabela de migrações do Drizzle', () => {
    const sql = appGrantsSql();
    expect(sql).not.toMatch(/GRANT[^;]*(TRUNCATE|ALL PRIVILEGES|CREATE|SUPERUSER|OWNER)/i);
    expect(sql).toContain('GRANT SELECT ON TABLE drizzle.__drizzle_migrations');
    expect(sql).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM ${APP_ROLE}`);
    for (const table of APPEND_ONLY_TABLES) expect(sql).toContain(`'${table}'`);
  });

  it('S6/SEC-230: reservas cupom e histórico de preço não são apagáveis pelo papel da API, e o grant reafirma isso a cada migrate', () => {
    expect([...NO_DELETE_TABLES]).toEqual(['coupon_reservations', 'product_price_history']);
    const sql = appGrantsSql();
    for (const table of NO_DELETE_TABLES) expect(sql).toContain(`'${table}'`);
    expect(sql).toContain(`REVOKE DELETE, TRUNCATE ON TABLE public.%I FROM ${APP_ROLE}`);
    for (const table of NO_DELETE_TABLES) expect(APPEND_ONLY_TABLES, 'não é append-only: o UPDATE continua permitido').not.toContain(table);
  });

  it('sem o papel no cluster o passo é ignorado e não executa nenhum GRANT', async () => {
    const queries: string[] = [];
    const db = {
      query: (text: string) => {
        queries.push(text);
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    };
    await expect(applyAppGrants(db as never)).resolves.toBe('skipped');
    expect(queries).toHaveLength(1);
  });

  it('com o papel no cluster aplica os privilégios numa só instrução (atômica)', async () => {
    const queries: string[] = [];
    const db = {
      query: (text: string) => {
        queries.push(text);
        return Promise.resolve({ rows: queries.length === 1 ? [{ '?column?': 1 }] : [], rowCount: 1 });
      },
    };
    await expect(applyAppGrants(db as never)).resolves.toBe('applied');
    expect(queries).toHaveLength(2);
    expect(queries[1]).toContain('GRANT USAGE ON SCHEMA public');
  });
});
