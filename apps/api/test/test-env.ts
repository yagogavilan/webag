// URLs do ambiente de teste, compartilhadas pelo vitest.config.e2e.ts e pelo global-setup.
// O banco de teste é um banco próprio (`<db>_test`), recriado e migrado do zero a cada execução,
// para nunca tocar nos dados de desenvolvimento. Redis: banco lógico 15 (o de dev usa o 0).
//
// Duas execuções ao mesmo tempo na mesma máquina (duas sessões, dois worktrees) NÃO podem dividir banco e Redis: o
// `DROP DATABASE ... FORCE` de uma derruba as conexões da outra e o `flushdb` apaga o cache dela (causa de falhas
// intermitentes "database does not exist"). Para isolar, defina TEST_DB_NAME (termina em `_test`) e TEST_REDIS_DB (0 a 15).
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * BUG-028a: o `.env` da raiz vale para os testes como já vale para `pnpm dev` e `db:migrate`. Só DATABASE_URL e REDIS_URL são lidos
 * (o resto do `.env`, como PAYMENT_PROVIDER e NODE_ENV=development, mudaria o comportamento da API sob teste). A variável do ambiente
 * do processo (CI) tem prioridade; sem nenhuma das duas, vale o padrão do docker compose. O banco usado é sempre `<db>_<pid>_test`.
 */
function fromDotEnv(key: 'DATABASE_URL' | 'REDIS_URL'): string | undefined {
  try {
    const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match?.[1] === key) return match[2]!.replace(/^(['"])(.*)\1$/, '$2') || undefined;
    }
  } catch {
    /* sem .env (CI): vale o ambiente do processo ou o padrão */
  }
  return undefined;
}

/**
 * BUG-019: `pid % 14` deixava duas execuções simultâneas (dev, QA, CI local) caírem no MESMO banco lógico do Redis em ~1 de 14 vezes, e o
 * `flushdb` de uma apagava as chaves da outra (falha intermitente que "passa isolada"). Agora cada execução RESERVA um banco (1 a 14) por
 * arquivo de trava em tmpdir (criação atômica `wx`, com pid; trava de processo morto é recolhida) e o libera ao sair. Sem vaga, recua para pid % 14.
 */
function claimRedisDb(): string {
  const dir = join(tmpdir(), 'webag-e2e-redis-locks');
  mkdirSync(dir, { recursive: true });
  for (let n = 1; n <= 14; n += 1) {
    const file = join(dir, String(n));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        writeFileSync(file, String(process.pid), { flag: 'wx' });
        process.on('exit', () => {
          try {
            if (readFileSync(file, 'utf8') === String(process.pid)) unlinkSync(file);
          } catch {
            /* já removida */
          }
        });
        return String(n);
      } catch {
        try {
          process.kill(Number(readFileSync(file, 'utf8')), 0); // dono vivo: tenta o próximo banco
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EPERM') break; // existe, de outro usuário
          try {
            unlinkSync(file); // dono morto (ou arquivo ilegível): recolhe e tenta de novo
          } catch {
            break;
          }
        }
      }
    }
  }
  return String(1 + (process.pid % 14));
}

const adminDatabaseUrl =
  process.env.DATABASE_URL ?? fromDotEnv('DATABASE_URL') ?? 'postgresql://webag:webag_dev_only@localhost:5432/webag';

const testDb = new URL(adminDatabaseUrl);
// S9: sem TEST_DB_NAME/TEST_REDIS_DB cada execução ganha banco e Redis próprios (pid) e os publica em `process.env`, que os
// workers do vitest herdam. Execuções simultâneas (dev, QA, CI local) deixam de se corromper.
process.env.TEST_DB_NAME ??= `${testDb.pathname.replace(/^\//, '').replace(/_test$/, '')}_${process.pid}_test`;
process.env.TEST_REDIS_DB ??= claimRedisDb(); // 1 a 14; o 0 é do dev e o 15, de quem fixa o valor
const testDbName = process.env.TEST_DB_NAME;
if (!/^[a-z0-9_]+_test$/.test(testDbName)) throw new Error(`TEST_DB_NAME inválido: ${testDbName} (use letras minúsculas, números e _, terminando em _test)`);
testDb.pathname = `/${testDbName}`;

const redis = new URL(process.env.REDIS_URL ?? fromDotEnv('REDIS_URL') ?? 'redis://localhost:6379');
redis.pathname = `/${process.env.TEST_REDIS_DB ?? '15'}`;

export const TEST_ENV = {
  adminDatabaseUrl,
  databaseUrl: testDb.toString(),
  redisUrl: redis.toString(),
};
