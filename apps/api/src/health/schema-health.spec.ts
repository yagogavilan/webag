import type { HealthIndicatorService } from '@nestjs/terminus';
import type pg from 'pg';
import { SchemaHealthIndicator } from './health.indicators.js';

const session = { up: () => ({ schema: { status: 'up' } }), down: (data: unknown) => ({ schema: { status: 'down', ...(data as object) } }) };
const indicatorService = { check: () => session } as unknown as HealthIndicatorService;
const poolWith = (n: number | Error) =>
  ({ query: () => (n instanceof Error ? Promise.reject(n) : Promise.resolve({ rows: [{ n }] })) }) as unknown as pg.Pool;

describe('SchemaHealthIndicator (migrações pendentes viram 503 em vez de 500 nas telas novas)', () => {
  it('banco com menos migrações que o código: down "migrações pendentes" e o motivo diz o que rodar', async () => {
    const indicator = new SchemaHealthIndicator(indicatorService, poolWith(52));
    expect(await indicator.pending()).toMatch(/pnpm db:migrate/);
    expect(await indicator.check()).toEqual({ schema: { status: 'down', message: 'migrações pendentes' } });
  });

  it('banco em dia ou à frente do código (deploy em andamento): up', async () => {
    expect(await new SchemaHealthIndicator(indicatorService, poolWith(10_000)).check()).toEqual({ schema: { status: 'up' } });
  });

  it('banco fora do ar: down sem expor o erro do driver', async () => {
    const result = await new SchemaHealthIndicator(indicatorService, poolWith(new Error('connect ECONNREFUSED 10.0.0.5:5432'))).check();
    expect(JSON.stringify(result)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
    expect(result).toEqual({ schema: { status: 'down', message: 'indisponível' } });
  });
});
