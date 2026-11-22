import pg from 'pg';
import { assertSafeDatabaseRole, UnsafeDatabaseRoleError } from '../src/platform/database/db-role-guard.js';
import { TEST_ENV } from './test-env.js';

/**
 * DB-01 (threat model §15.6, ADR-018 D19 item 1): contra um PostgreSQL real, a checagem de boot recusa em produção (e sem NODE_ENV) o superusuário, o dono
 * do `audit_log` e o membro de `webag_migrator`, e deixa o `webag_app` subir. Só roda com os papéis (o global-setup os cria quando o usuário do teste é
 * superusuário); com `REQUIRE_DB_ROLES=1` (CI) a ausência deles é falha. O que este arquivo NÃO prova (precisa de Docker): o `docker compose` de produção
 * subindo a API como `webag_app` e a ordem de implantação no staging.
 */
async function rolesAvailable(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: TEST_ENV.databaseUrl });
  await probe.connect();
  try {
    const { rows } = await probe.query<{ owner: string; app: boolean }>(`SELECT pg_get_userbyid(datdba) AS owner, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webag_app') AS app FROM pg_database WHERE datname = current_database()`);
    return rows[0]?.owner === 'webag_migrator' && rows[0].app;
  } finally {
    await probe.end();
  }
}
const available = await rolesAvailable();
if (!available && process.env.REQUIRE_DB_ROLES === '1') throw new Error('REQUIRE_DB_ROLES=1, mas o banco de teste não tem os papéis webag_migrator e webag_app');

describe.skipIf(!available)('D-06: o boot de produção recusa papel de banco com poder demais (DB-01)', () => {
  const pools: pg.Pool[] = [];
  const as = (url: string) => {
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    pools.push(pool);
    return pool;
  };
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
  });

  it('webag_app sobe em produção, sem NODE_ENV e em desenvolvimento', async () => {
    const app = as(TEST_ENV.appDatabaseUrl);
    for (const env of ['production', undefined, 'development', 'test']) expect(await assertSafeDatabaseRole(app, env), String(env)).toMatchObject({ user: 'webag_app', violations: [] });
  });

  it('o usuário superusuário do teste: produção e NODE_ENV ausente recusam; development e test só avisam', async () => {
    const admin = as(TEST_ENV.databaseUrl);
    for (const env of ['production', undefined]) await expect(assertSafeDatabaseRole(admin, env), String(env)).rejects.toBeInstanceOf(UnsafeDatabaseRoleError);
    expect((await assertSafeDatabaseRole(admin, 'development')).violations).toContain('superuser');
    expect((await assertSafeDatabaseRole(admin, 'test')).enforced).toBe(false);
  });

  it('webag_migrator (dono das tabelas e do banco) é recusado em produção por dono do audit_log e por ser o papel das migrações', async () => {
    const migrator = as(TEST_ENV.migratorDatabaseUrl);
    const error = await assertSafeDatabaseRole(migrator, 'production').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsafeDatabaseRoleError);
    expect((error as UnsafeDatabaseRoleError).violations).toEqual(expect.arrayContaining(['owns_audit_log', 'migrator_member']));
    expect((error as UnsafeDatabaseRoleError).message).toContain('webag_app');
  });
});
