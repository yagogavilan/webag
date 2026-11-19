import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { PG_POOL } from '../platform/database/database.module.js';
import { REDIS } from '../platform/redis/redis.module.js';

const CHECK_TIMEOUT_MS = 2_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout de ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `/health/ready` é público (o orquestrador o consulta): nunca devolve a mensagem do driver, que traz host, porta e
 * usuário do banco/Redis (ex.: `connect ECONNREFUSED 10.0.0.5:5432`). O motivo real vai para o log do servidor.
 */
const PUBLIC_DOWN_MESSAGE = 'indisponível';
const logger = new Logger('Health');
function failure(key: string, error: unknown): { message: string } {
  logger.warn(`${key} indisponível: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
  return { message: PUBLIC_DOWN_MESSAGE };
}

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  async check(key = 'database'): Promise<HealthIndicatorResult> {
    const session = this.indicator.check(key);
    try {
      await withTimeout(this.pool.query('SELECT 1'), CHECK_TIMEOUT_MS);
      return session.up();
    } catch (error) {
      return session.down(failure(key, error));
    }
  }
}

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(key = 'redis'): Promise<HealthIndicatorResult> {
    const session = this.indicator.check(key);
    try {
      if (this.redis.status === 'wait') {
        await withTimeout(this.redis.connect(), CHECK_TIMEOUT_MS);
      }
      await withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS);
      return session.up();
    } catch (error) {
      return session.down(failure(key, error));
    }
  }
}

const JOURNAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle/meta/_journal.json');

/** Quantas migrações o código conhece (o diário do drizzle) ou `null` se o arquivo não está na imagem (aí não há o que comparar). */
function knownMigrations(): number | null {
  try {
    const journal = JSON.parse(readFileSync(JOURNAL, 'utf8')) as { entries?: unknown[] };
    return Array.isArray(journal.entries) ? journal.entries.length : null;
  } catch {
    return null;
  }
}

/**
 * Banco com migração pendente: o código lê colunas que ainda não existem e o usuário vê 500 "INTERNAL_ERROR" só nas telas novas (caso real: o
 * `GET /v1/admin/alerts` com `resolved_by` da migração 0053 num banco de dev em 0052). Compara as migrações aplicadas com as do código: loga no
 * boot e deixa `/health/ready` em 503 ("migrações pendentes"), com a correção no log do servidor.
 */
@Injectable()
export class SchemaHealthIndicator implements OnApplicationBootstrap {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  /** `null` quando está em dia (ou não dá para comparar); senão o texto do problema. */
  async pending(): Promise<string | null> {
    const known = knownMigrations();
    if (known === null) return null;
    const { rows } = await withTimeout(this.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'), CHECK_TIMEOUT_MS);
    const applied = rows[0]?.n ?? 0;
    return applied < known ? `${known - applied} migração(ões) pendente(s) (aplicadas ${applied} de ${known}): rode "pnpm db:migrate" (em produção, node dist/platform/database/migrate.js)` : null;
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      const problem = await this.pending();
      if (problem) logger.error(`schema do banco desatualizado: ${problem}`);
    } catch {
      /* banco fora do ar no boot: o readiness já acusa */
    }
  }

  async check(key = 'schema'): Promise<HealthIndicatorResult> {
    const session = this.indicator.check(key);
    try {
      const problem = await this.pending();
      if (!problem) return session.up();
      logger.error(`schema do banco desatualizado: ${problem}`);
      return session.down({ message: 'migrações pendentes' });
    } catch (error) {
      return session.down(failure(key, error));
    }
  }
}
