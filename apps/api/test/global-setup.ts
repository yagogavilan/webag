import { Redis } from 'ioredis';
import pg from 'pg';
import { runMigrations } from '../src/platform/database/migrate.js';

/** Recria o banco de teste, aplica as migrações do zero (prova que `migrate` funciona) e limpa o Redis de teste. */
export default async function setup(): Promise<void> {
  const adminUrl = process.env.WEBAG_ADMIN_DATABASE_URL;
  const testUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!adminUrl || !testUrl || !redisUrl) throw new Error('Variáveis de teste ausentes');

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
}
