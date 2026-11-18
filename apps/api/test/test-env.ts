// URLs do ambiente de teste, compartilhadas pelo vitest.config.e2e.ts e pelo global-setup.
// O banco de teste é um banco próprio (`<db>_test`), recriado e migrado do zero a cada execução,
// para nunca tocar nos dados de desenvolvimento. Redis: banco lógico 15 (o de dev usa o 0).
//
// Duas execuções ao mesmo tempo na mesma máquina (duas sessões, dois worktrees) NÃO podem dividir banco e Redis: o
// `DROP DATABASE ... FORCE` de uma derruba as conexões da outra e o `flushdb` apaga o cache dela (causa de falhas
// intermitentes "database does not exist"). Para isolar, defina TEST_DB_NAME (termina em `_test`) e TEST_REDIS_DB (0 a 15).
const adminDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://webag:webag_dev_only@localhost:5432/webag';

const testDb = new URL(adminDatabaseUrl);
const testDbName = process.env.TEST_DB_NAME ?? `${testDb.pathname.replace(/^\//, '').replace(/_test$/, '')}_test`;
if (!/^[a-z0-9_]+_test$/.test(testDbName)) throw new Error(`TEST_DB_NAME inválido: ${testDbName} (use letras minúsculas, números e _, terminando em _test)`);
testDb.pathname = `/${testDbName}`;

const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redis.pathname = `/${process.env.TEST_REDIS_DB ?? '15'}`;

export const TEST_ENV = {
  adminDatabaseUrl,
  databaseUrl: testDb.toString(),
  redisUrl: redis.toString(),
};
