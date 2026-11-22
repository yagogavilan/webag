import pg from 'pg';
import { APPEND_ONLY_COLUMN_UPDATES, APPEND_ONLY_TABLES } from '../src/platform/database/app-grants.js';
import { TEST_ENV } from './test-env.js';

/**
 * D-06 (ADR-018 D9, tech-lead B4, C-ADM-06 b): prova NO BANCO que a API não consegue alterar nem apagar o histórico, nem desligar o
 * gatilho que o protege. Só roda com os papéis `webag_migrator` e `webag_app` (o global-setup os cria quando o usuário do teste é
 * superusuário). Sem eles o arquivo é pulado; com `REQUIRE_DB_ROLES=1` (CI) a ausência dos papéis é falha.
 * NÃO foi executado na sessão que o escreveu (sem Docker): rodar `pnpm --filter @webag/api test:e2e -- db-roles` na primeira sessão com Docker.
 */
async function rolesAvailable(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: TEST_ENV.databaseUrl });
  await probe.connect();
  try {
    const { rows } = await probe.query<{ owner: string; app: boolean }>(
      `SELECT pg_get_userbyid(datdba) AS owner, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webag_app') AS app FROM pg_database WHERE datname = current_database()`,
    );
    return rows[0]?.owner === 'webag_migrator' && rows[0].app;
  } finally {
    await probe.end();
  }
}

const available = await rolesAvailable();
if (!available && process.env.REQUIRE_DB_ROLES === '1') throw new Error('REQUIRE_DB_ROLES=1, mas o banco de teste não tem os papéis webag_migrator e webag_app');

describe.skipIf(!available)('D-06: o papel da API não altera o histórico nem a estrutura do banco', () => {
  let app: pg.Pool;
  let owner: pg.Pool;
  let admin: pg.Pool;

  beforeAll(() => {
    app = new pg.Pool({ connectionString: TEST_ENV.appDatabaseUrl, max: 2 });
    owner = new pg.Pool({ connectionString: TEST_ENV.migratorDatabaseUrl, max: 1 });
    admin = new pg.Pool({ connectionString: TEST_ENV.databaseUrl, max: 1 });
  });
  afterAll(async () => {
    await Promise.all([app.end(), owner.end(), admin.end()]);
  });

  /** Estado de partida: uma linha em cada tabela que o teste tenta mexer, inserida pelo superusuário do teste. */
  const insertAuditRow = async (): Promise<number> => {
    const { rows } = await admin.query<{ id: string }>(`INSERT INTO audit_log (action) VALUES ('d06.probe') RETURNING id`);
    return Number(rows[0]!.id);
  };
  const denied = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ code: '42501' }); // insufficient_privilege

  it('o papel da API não é superusuário, não faz bypass de RLS, não cria papel nem banco', async () => {
    const { rows } = await app.query<Record<string, boolean>>(
      `SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolreplication: false });
  });

  it('o banco e todas as tabelas de negócio são do dono (webag_migrator), nenhuma é da API', async () => {
    const { rows } = await admin.query<{ relname: string; owner: string }>(
      `SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')`,
    );
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.filter((r) => r.owner !== 'webag_migrator').map((r) => r.relname)).toEqual([]);
  });

  it('audit_log: INSERT e SELECT funcionam; UPDATE, DELETE e TRUNCATE são negados pelo PRIVILÉGIO (antes de chegar ao gatilho)', async () => {
    const inserted = await app.query(`INSERT INTO audit_log (action) VALUES ('d06.app-insert')`);
    expect(inserted.rowCount).toBe(1);
    const id = await insertAuditRow();
    expect((await app.query(`SELECT id FROM audit_log WHERE id = $1`, [id])).rowCount).toBe(1);
    await denied(app.query(`UPDATE audit_log SET action = 'x' WHERE id = $1`, [id]));
    await denied(app.query(`DELETE FROM audit_log WHERE id = $1`, [id]));
    await denied(app.query(`TRUNCATE audit_log`));
  });

  it('não dá para desligar o gatilho append-only nem contornar os gatilhos de sessão', async () => {
    // `ALTER TABLE` exige ser dono: o erro é 42501 ("must be owner of table audit_log")
    await denied(app.query(`ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only`));
    await denied(app.query(`ALTER TABLE audit_log DISABLE TRIGGER ALL`));
    await denied(app.query(`DROP TRIGGER audit_log_append_only ON audit_log`));
    await denied(app.query(`SET session_replication_role = replica`)); // só superusuário (ou GRANT SET explícito, que não existe)
    await denied(app.query(`CREATE TABLE d06_should_fail (id int)`));
    await denied(app.query(`DROP TABLE audit_log`));
    await denied(app.query(`ALTER TABLE audit_log OWNER TO webag_app`));
  });

  it.each(APPEND_ONLY_TABLES.filter((t) => t !== 'audit_log'))('%s: a API não tem UPDATE nem DELETE, exceto as colunas de truncamento de IP', async (table) => {
    const columns = APPEND_ONLY_COLUMN_UPDATES[table] ?? [];
    const priv = async (kind: string): Promise<boolean> =>
      (await app.query<{ ok: boolean }>(`SELECT has_table_privilege(current_user, $1::regclass, $2) AS ok`, [`public.${table}`, kind])).rows[0]!.ok;
    expect(await priv('INSERT'), 'INSERT').toBe(true);
    expect(await priv('SELECT'), 'SELECT').toBe(true);
    expect(await priv('UPDATE'), 'UPDATE da tabela').toBe(false);
    expect(await priv('DELETE'), 'DELETE').toBe(false);
    expect(await priv('TRUNCATE'), 'TRUNCATE').toBe(false);
    const { rows } = await app.query<{ attname: string }>(
      `SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped AND has_column_privilege(current_user, a.attrelid, a.attnum, 'UPDATE')
        ORDER BY a.attname`,
      [`public.${table}`],
    );
    expect(rows.map((r) => r.attname)).toEqual([...columns].sort());
  });

  it('o truncamento de IP da anonimização (SEC-159) continua possível pelo papel da API, e só ele (o privilégio de coluna é checado mesmo sem linha)', async () => {
    await app.query(`UPDATE terms_acceptances SET ip = webag_truncate_ip(ip), platform = webag_platform_family(platform) WHERE false`);
    await app.query(`UPDATE consents SET ip = webag_truncate_ip(ip) WHERE false`);
    await denied(app.query(`UPDATE terms_acceptances SET document_id = document_id WHERE false`));
    await denied(app.query(`UPDATE consents SET user_id = user_id WHERE false`));
    await denied(app.query(`DELETE FROM consents WHERE false`));
  });

  it('o /health/ready da API consegue contar as migrações (SELECT em drizzle.__drizzle_migrations)', async () => {
    const { rows } = await app.query<{ n: number }>(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
    expect(rows[0]!.n).toBeGreaterThan(50);
    await denied(app.query(`DELETE FROM drizzle.__drizzle_migrations`));
  });

  it('a API usa sequências (bigserial do audit_log) e lê tabelas não append-only normalmente', async () => {
    const { rows } = await app.query<{ n: number }>(`SELECT count(*)::int AS n FROM categories`);
    expect(rows[0]!.n).toBeGreaterThanOrEqual(0);
  });

  it('as tabelas append-only da lista são exatamente as protegidas por gatilho no banco (tabela nova com gatilho sem entrar na lista falha)', async () => {
    const { rows } = await admin.query<{ relname: string }>(
      `SELECT DISTINCT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND t.tgname ~ '(append_only|immutable)$' ORDER BY 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([...APPEND_ONLY_TABLES].sort());
  });

  it('o dono continua podendo migrar: cria e remove uma tabela e é quem "possui" o gatilho (o contraste do teste)', async () => {
    await owner.query(`CREATE TABLE d06_owner_probe (id int)`);
    await owner.query(`DROP TABLE d06_owner_probe`);
    const { rows } = await owner.query<{ ok: boolean }>(`SELECT pg_has_role(current_user, c.relowner, 'USAGE') AS ok FROM pg_class c WHERE c.relname = 'audit_log'`);
    expect(rows[0]!.ok).toBe(true);
  });

  it('migrar do zero como dono, de novo, é idempotente e não perde os privilégios do papel da API', async () => {
    const { runMigrations } = await import('../src/platform/database/migrate.js');
    await runMigrations(TEST_ENV.migratorDatabaseUrl);
    await denied(app.query(`DELETE FROM audit_log`));
    expect((await app.query(`INSERT INTO audit_log (action) VALUES ('d06.after-remigrate')`)).rowCount).toBe(1);
  });
});
