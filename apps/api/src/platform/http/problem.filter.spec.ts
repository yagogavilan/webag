import { type ArgumentsHost, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { ProblemFilter } from './problem.filter.js';

interface Captured {
  status: number | undefined;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

function run(filter: ProblemFilter, exception: unknown, path = '/v1/home'): Captured {
  const captured: Captured = { status: undefined, headers: {}, body: undefined };
  const res = {
    setHeader: (name: string, value: string) => {
      captured.headers[name] = value;
    },
    status: (code: number) => {
      captured.status = code;
      return res;
    },
    type: () => res,
    json: (body: Record<string, unknown>) => {
      captured.body = body;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ path, id: 'req-1' }) }) } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  return captured;
}

/** Como o Drizzle embrulha a falha do `pg`: a causa vem em `cause`. */
function drizzleError(cause: Error & { code?: string }): Error {
  const wrapper = new Error('Failed query: select 1');
  (wrapper as Error & { cause?: unknown }).cause = cause;
  return wrapper;
}

describe('ProblemFilter: indisponibilidade sob saturação (BUG-035)', () => {
  let warn: MockInstance<Logger['warn']>;
  let error: MockInstance<Logger['error']>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pool esgotado (timeout de conexão) vira 503 SERVICE_UNAVAILABLE com Retry-After, sem pilha', () => {
    const out = run(new ProblemFilter(), drizzleError(new Error('timeout exceeded when trying to connect')));

    expect(out.status).toBe(503);
    expect(out.headers['Retry-After']).toBe('2');
    expect(out.headers['Cache-Control']).toBe('private, no-store');
    expect(out.body).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(typeof out.body?.title).toBe('string');
    expect(JSON.stringify(out.body)).not.toMatch(/Failed query|select 1|timeout exceeded|at .*\.ts/);
    expect(error).not.toHaveBeenCalled();
  });

  it('consulta cancelada por statement_timeout (57014) também vira 503', () => {
    const cause = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });

    const out = run(new ProblemFilter(), drizzleError(cause));

    expect(out.status).toBe(503);
    expect(out.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('banco sem conexão livre (53300) vira 503', () => {
    const cause = Object.assign(new Error('sorry, too many clients already'), { code: '53300' });

    expect(run(new ProblemFilter(), drizzleError(cause)).status).toBe(503);
  });

  it('erro inesperado que não é de saturação continua 500 INTERNAL_ERROR e sem a mensagem interna', () => {
    const out = run(new ProblemFilter(), new Error('segredo interno'));

    expect(out.status).toBe(500);
    expect(out.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(out.body)).not.toContain('segredo interno');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('o log é UMA linha de aviso por janela, agregada, e nunca a pilha completa por requisição', () => {
    const filter = new ProblemFilter();
    const saturated = () => drizzleError(new Error('timeout exceeded when trying to connect'));

    for (let i = 0; i < 400; i += 1) run(filter, saturated());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    run(filter, saturated());

    expect(warn).toHaveBeenCalledTimes(2);
    const logged = warn.mock.calls.map((call) => call[0] as unknown);
    expect(logged[1]).toMatchObject({ event: 'http.db_saturated', count: 400 });
  });
});
