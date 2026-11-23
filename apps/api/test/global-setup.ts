import { readFileSync } from 'node:fs';
import { Redis } from 'ioredis';
import pg from 'pg';
import { runMigrations } from '../src/platform/database/migrate.js';
import { TEST_ENV, TEST_ROLES } from './test-env.js';

const ROLES_GRANTS_SQL = new URL('../../../infra/postgres/40-roles-grants.sql', import.meta.url);

/**
 * D-06: garante os papéis `webag_migrator` e `webag_app` no cluster (idempotente e tolerante a execuções simultâneas). Exige superusuário;
 * sem ele devolve `false` e o setup segue como antes (migra com o usuário do teste), e `db-roles.e2e-spec.ts` pula (ou falha, com REQUIRE_DB_ROLES=1).
 */
async function ensureRoles(admin: pg.Client): Promise<boolean> {
  try {
    for (const { user, password } of [TEST_ROLES.migrator, TEST_ROLES.app]) {
      if (!/^[a-z_]+$/.test(user) || !/^[A-Za-z0-9_]+$/.test(password)) throw new Error('papel ou senha de teste inválidos (só letras, números e _)');
      await admin.query(
        `DO $do$ BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${user}') THEN
             CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
           END IF;
         EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
         END $do$`,
      );
    }
    return true;
  } catch (error) {
    console.warn(`[e2e] papéis webag_migrator/webag_app indisponíveis (${error instanceof Error ? error.message : String(error)}): migrando como o usuário do teste; o D-06 não será provado`);
    return false;
  }
}

/**
 * Disco (DT-116): execução que morre no meio (ENOSPC, kill, timeout) deixa o banco `<db>_<pid>_test` para trás (~30 MB cada) e, com o tempo, o disco enche. Apaga os bancos de execuções
 * ANTERIORES cujo processo (pid do nome) não existe mais e sem conexão aberta. Nunca toca o desta execução, nem os de nome fixo por TEST_DB_NAME (QA e Security os guardam para inspeção).
 */
async function dropStaleRunDatabases(admin: pg.Client, current: string): Promise<void> {
  try {
    const { rows } = await admin.query<{ datname: string }>(`SELECT datname FROM pg_database d WHERE datname ~ '_[0-9]+_test$' AND datname <> $1 AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname)`, [current]);
    for (const { datname } of rows) {
      const pid = Number(/_(\d+)_test$/.exec(datname)?.[1]);
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        alive = (error as NodeJS.ErrnoException).code === 'EPERM'; // ESRCH: o processo morreu
      }
      if (!alive && /^[a-z0-9_]+$/.test(datname)) await admin.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    }
  } catch (error) {
    console.warn(`[e2e] limpeza de bancos de teste antigos ignorada: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Extensões, posse do banco e acesso, com o MESMO arquivo que a infra usa em produção (`infra/postgres/40-roles-grants.sql`). */
async function provisionDatabaseRoles(databaseUrl: string): Promise<void> {
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query(readFileSync(ROLES_GRANTS_SQL, 'utf8'));
  } finally {
    await db.end();
  }
}

/** Recria o banco de teste, aplica as migrações do zero (prova que `migrate` funciona) e limpa o Redis de teste. */
export default async function setup(): Promise<() => Promise<void>> {
  const { adminDatabaseUrl: adminUrl, databaseUrl: testUrl, redisUrl } = TEST_ENV;

  const dbName = new URL(testUrl).pathname.slice(1);
  // BUG-028a: diz contra qual PostgreSQL e Redis o "verde" foi obtido (sem senha).
  const target = new URL(testUrl);
  const redisTarget = new URL(redisUrl);
  console.log(`[e2e] PostgreSQL ${target.hostname}:${target.port || '5432'}/${dbName}; Redis ${redisTarget.hostname}:${redisTarget.port || '6379'}${redisTarget.pathname}`);
  if (!dbName.endsWith('_test')) throw new Error(`Banco de teste inesperado: ${dbName}`);

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  let rolesReady: boolean;
  try {
    await dropStaleRunDatabases(admin, dbName);
    rolesReady = await ensureRoles(admin);
    // SEC-212: no CI (REQUIRE_DB_ROLES=1) sem os papéis a execução inteira falha já aqui, antes de qualquer teste de papel ser "verde" por estar pulado.
    if (!rolesReady && process.env.REQUIRE_DB_ROLES === '1') throw new Error('REQUIRE_DB_ROLES=1, mas os papéis webag_migrator e webag_app não puderam ser criados (o usuário do teste precisa ser superusuário)');
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
  // Com os papéis: o banco é do `webag_migrator`, que roda as migrações (como o job `migrate` em produção) e dá os privilégios ao `webag_app`.
  if (rolesReady) await provisionDatabaseRoles(testUrl);
  await runMigrations(rolesReady ? TEST_ENV.migratorDatabaseUrl : testUrl);

  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();
  return teardown;
}

/** S9: apaga o banco da execução (o nome tem o pid); bancos fixados por TEST_DB_NAME são mantidos para inspeção. */
async function teardown(): Promise<void> {
  if (!process.env.TEST_DB_NAME || !/_\d+_test$/.test(process.env.TEST_DB_NAME)) return;
  const admin = new pg.Client({ connectionString: TEST_ENV.adminDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${process.env.TEST_DB_NAME}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
