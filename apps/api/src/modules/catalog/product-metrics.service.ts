import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { ParametersService } from '../admin/index.js';

export const METRICS_MIN_SAMPLE = 5;

/**
 * WB-379 C2 / D11: tempo de cadastro (mediana e p90) por `via` ou por loja. Só CADASTRO CONTÍNUO entra na mediana: publicado até `cadastro_sessao_max_min` depois do
 * início (rascunho esquecido por horas é lixo estatístico, E-8); o resto vai em `interrupted`. Grupo com menos de 5 cadastros não devolve percentil (`insufficient`).
 * Sem nome, descrição nem preço do produto: a tabela nem tem essas colunas.
 */
@Injectable()
export class ProductMetricsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
  ) {}

  async report(query: { days: 7 | 30 | 90; groupBy: 'via' | 'store'; storeId?: string | undefined; cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ o: number }>(query.cursor);
    const offset = cursor && Number.isInteger(cursor.o) && cursor.o > 0 ? cursor.o : 0;
    const maxMinutes = await this.params.getNumber('cadastro_sessao_max_min');
    const since = new Date(Date.now() - query.days * 86_400_000);
    const keyExpr = query.groupBy === 'via' ? sql`m.via` : sql`m.store_id::text`;
    const labelExpr = query.groupBy === 'via' ? sql`m.via` : sql`coalesce(max(s.name), m.store_id::text)`;
    const result = await this.db.execute<{ key: string; label: string; n: number; interrupted: number; median: number | null; p90: number | null }>(sql`
      select ${keyExpr} as key, ${labelExpr} as label,
        count(*) filter (where extract(epoch from (m.published_at - m.started_at)) <= ${maxMinutes * 60})::int as n,
        count(*) filter (where extract(epoch from (m.published_at - m.started_at)) > ${maxMinutes * 60})::int as interrupted,
        (percentile_cont(0.5) within group (order by extract(epoch from (m.published_at - m.started_at))) filter (where extract(epoch from (m.published_at - m.started_at)) <= ${maxMinutes * 60}))::float8 as median,
        (percentile_cont(0.9) within group (order by extract(epoch from (m.published_at - m.started_at))) filter (where extract(epoch from (m.published_at - m.started_at)) <= ${maxMinutes * 60}))::float8 as p90
      from product_creation_metrics m
      left join stores s on s.id = m.store_id
      where m.published_at is not null and m.published_at >= ${since.toISOString()}::timestamptz
        ${query.storeId ? sql`and m.store_id = ${query.storeId}::uuid` : sql``}
      group by ${keyExpr}
      order by 3 desc, 1 asc
      limit ${limit + 1} offset ${offset}`);
    const page = result.rows.slice(0, limit);
    return {
      days: query.days,
      groupBy: query.groupBy,
      minSample: METRICS_MIN_SAMPLE,
      computedAt: new Date().toISOString(),
      rows: page.map((row) => {
        const insufficient = row.n < METRICS_MIN_SAMPLE;
        return { key: row.key, label: row.label, n: row.n, interrupted: row.interrupted, insufficient, medianSeconds: insufficient || row.median === null ? null : Math.round(row.median), p90Seconds: insufficient || row.p90 === null ? null : Math.round(row.p90) };
      }),
      nextCursor: result.rows.length > limit ? encodeCursor({ o: offset + limit }) : null,
    };
  }
}
