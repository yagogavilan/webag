import { Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');

export type Db = NodePgDatabase<typeof schema>;
/** Transação do Drizzle: mesma API de consulta que `Db`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Aceita tanto o banco quanto uma transação em andamento (para compor operações atômicas). */
export type DbOrTx = Db | Tx;

/** Resultado de `SessionLockService.tryRun`: `acquired: false` = outra instância já tem a trava (nada foi executado). */
export type LockRun<T> = { acquired: true; value: T } | { acquired: false };

/** Entregue a quem trabalha sob a trava: `lost()` vira `true` se a conexão que a segura caiu (a trava sumiu junto). */
export interface LockHandle {
  lost: () => boolean;
}

/**
 * Trava consultiva de SESSÃO em conexão dedicada, para trabalho LONGO que chama rede (conciliação com o Mercado Pago, cobrança).
 *
 * Por que não `pg_try_advisory_xact_lock` dentro de `db.transaction`: a transação fica ociosa durante a chamada de rede e o
 * `idle_in_transaction_session_timeout` do PostgreSQL a mata (B1 do review de desempenho de 2026-11-22). Aqui a conexão NÃO está
 * em transação (`idle`, não `idle in transaction`), então o timeout não se aplica; o trabalho em si usa o pool normal, em
 * transações curtas. A trava mora na sessão: se a conexão cair o PostgreSQL a solta sozinho (`lost()` avisa).
 *
 * Mesmo espaço de chaves das travas `xact` (`hashtext(chave)`): as duas formas se excluem mutuamente.
 * Limite: atrás de PgBouncer em modo transação a trava de sessão não é confiável; essas conexões precisam ir direto ao
 * PostgreSQL (ou em modo sessão). Ver docs/arquitetura/divida-tecnica.md (DT-085).
 */
@Injectable()
export class SessionLockService {
  private readonly logger = new Logger(SessionLockService.name);

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async tryRun<T>(key: string, work: (handle: LockHandle) => Promise<T>): Promise<LockRun<T>> {
    const client = await this.pool.connect();
    let broken = false;
    const onError = (error: Error): void => {
      broken = true;
      this.logger.warn(`conexão da trava "${key}" caiu: ${error.message}`);
    };
    client.on('error', onError);
    let held = false;
    try {
      const got = await client.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtext($1)) as ok', [key]);
      held = got.rows[0]?.ok === true;
      if (!held) return { acquired: false };
      return { acquired: true, value: await work({ lost: () => broken }) };
    } finally {
      client.removeListener('error', onError);
      let clean = !broken;
      if (held && clean) {
        // Solta a trava ANTES de devolver a conexão ao pool; se não der, a conexão é destruída (o PostgreSQL solta a trava ao fechar).
        clean = await client
          .query('select pg_advisory_unlock(hashtext($1))', [key])
          .then(() => true)
          .catch(() => false);
      }
      client.release(!clean);
    }
  }
}

/** Fecha o pool no shutdown gracioso. */
@Injectable()
class PgPoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

/** Conexão com o PostgreSQL e Drizzle (ADR-001/007) sobre o mesmo pool. */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const idleInTransactionMs = config.get('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', { infer: true });
        const pool = new pg.Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          max: config.get('DB_POOL_MAX', { infer: true }),
          connectionTimeoutMillis: 3_000,
          idleTimeoutMillis: 30_000,
          application_name: 'webag-api',
          // Parâmetros de sessão na abertura da conexão (valem para todas as consultas do pool):
          //  - statement_timeout: uma consulta fora de controle não prende o pool para sempre (0 = sem teto);
          //  - idle_in_transaction_session_timeout: transação esquecida aberta segura lock e conexão. O servidor MATA a conexão; por isso
          //    nenhum código pode manter transação aberta durante chamada de rede (ver `SessionLockService`) e o pool abaixo trata o erro;
          //  - pg_trgm.word_similarity_threshold: o limite 0,5 da busca por semelhança (`<%`), para o índice GIN de trigramas ser usado (ver product-feed.service).
          options: `-c statement_timeout=${config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true })} -c idle_in_transaction_session_timeout=${idleInTransactionMs} -c pg_trgm.word_similarity_threshold=0.5`,
        });
        // O `pg` emite `error` na conexão que o servidor derrubou (timeout, reinício, rede). Sem listener o Node trata como exceção não
        // capturada e DERRUBA O PROCESSO. O pool só ouve a conexão enquanto ela está ociosa nele; emprestada (checkout), quem ouve é o
        // listener posto aqui na abertura. Erro de conexão ociosa nunca pode matar a API: registra e segue (a conexão é descartada).
        const logger = new Logger('PgPool');
        pool.on('error', (error) => logger.warn(`conexão ociosa do pool caiu: ${error.message}`));
        pool.on('connect', (client) => {
          client.on('error', (error) => logger.warn(`conexão em uso caiu: ${error.message}`));
        });
        return pool;
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Db => drizzle(pool, { schema, casing: 'snake_case' }),
    },
    SessionLockService,
    PgPoolLifecycle,
  ],
  exports: [PG_POOL, DRIZZLE, SessionLockService],
})
export class DatabaseModule {}
