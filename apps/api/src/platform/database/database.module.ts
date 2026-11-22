import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
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
      useFactory: (config: ConfigService<Env, true>) =>
        new pg.Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          max: config.get('DB_POOL_MAX', { infer: true }),
          connectionTimeoutMillis: 3_000,
          idleTimeoutMillis: 30_000,
          application_name: 'webag-api',
          // Parâmetros de sessão na abertura da conexão (valem para todas as consultas do pool):
          //  - statement_timeout: uma consulta fora de controle não prende o pool para sempre (0 = sem teto);
          //  - idle_in_transaction_session_timeout: transação esquecida aberta segura lock e conexão (padrão do skill postgres-postgis-performance);
          //  - pg_trgm.word_similarity_threshold: o limite 0,5 da busca por semelhança (`<%`), para o índice GIN de trigramas ser usado (ver product-feed.service).
          options: `-c statement_timeout=${config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true })} -c idle_in_transaction_session_timeout=${config.get('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', { infer: true })} -c pg_trgm.word_similarity_threshold=0.5`,
        }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Db => drizzle(pool, { schema, casing: 'snake_case' }),
    },
    PgPoolLifecycle,
  ],
  exports: [PG_POOL, DRIZZLE],
})
export class DatabaseModule {}
