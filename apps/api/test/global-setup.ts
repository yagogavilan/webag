import { Redis } from 'ioredis';
import pg from 'pg';
import { runMigrations } from '../src/platform/database/migrate.js';
import { TEST_ENV } from './test-env.js';

/** Recria o banco de teste, aplica as migrações do zero (prova que `migrate` funciona) e limpa o Redis de teste. */
export default async function setup(): Promise<() => Promise<void>> {
  const { adminDatabaseUrl: adminUrl, databaseUrl: testUrl, redisUrl } = TEST_ENV;

  const dbName = new URL(testUrl).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Banco de teste inesperado: ${dbName}`);

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(testUrl);

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
