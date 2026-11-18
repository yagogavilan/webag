// URLs do ambiente de teste, compartilhadas pelo vitest.config.e2e.ts e pelo global-setup.
// O banco de teste é um banco próprio (`<db>_test`), recriado e migrado do zero a cada execução,
// para nunca tocar nos dados de desenvolvimento. Redis: banco lógico 15 (o de dev usa o 0).
const adminDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://webag:webag_dev_only@localhost:5432/webag';

const testDb = new URL(adminDatabaseUrl);
testDb.pathname = `/${testDb.pathname.replace(/^\//, '').replace(/_test$/, '')}_test`;

const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redis.pathname = '/15';

export const TEST_ENV = {
  adminDatabaseUrl,
  databaseUrl: testDb.toString(),
  redisUrl: redis.toString(),
};
