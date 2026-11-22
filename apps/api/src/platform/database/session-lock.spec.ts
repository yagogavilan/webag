import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { SessionLockService } from './database.module.js';

type Step = { match: RegExp; result: () => Promise<{ rows: unknown[] }> };

/** Conexão falsa: responde às consultas por `match` e registra como foi devolvida ao pool (`release(true)` = destruída). */
function fakeClient(steps: Step[]) {
  const client = Object.assign(new EventEmitter(), {
    released: [] as (boolean | undefined)[],
    query: (sql: string) => {
      const step = steps.find((s) => s.match.test(sql));
      if (!step) return Promise.reject(new Error(`consulta inesperada: ${sql}`));
      return step.result();
    },
    release(destroy?: boolean) {
      this.released.push(destroy);
    },
  });
  const pool = { connect: () => Promise.resolve(client) } as unknown as pg.Pool;
  return { client, locks: new SessionLockService(pool) };
}

const ok = (rows: unknown[] = []) => () => Promise.resolve({ rows });
const fails = (message: string) => () => Promise.reject(new Error(message));

describe('SessionLockService.tryRun', () => {
  it('trava obtida: roda o trabalho, solta a trava e devolve a conexão ao pool VIVA', async () => {
    const { client, locks } = fakeClient([{ match: /pg_try_advisory_lock/, result: ok([{ ok: true }]) }, { match: /pg_advisory_unlock/, result: ok() }]);
    const run = await locks.tryRun('k', () => Promise.resolve('feito'));
    expect(run).toEqual({ acquired: true, value: 'feito' });
    expect(client.released).toEqual([false]);
  });

  it('trava ocupada: não roda o trabalho e a conexão volta ao pool viva', async () => {
    const { client, locks } = fakeClient([{ match: /pg_try_advisory_lock/, result: ok([{ ok: false }]) }]);
    expect(await locks.tryRun('k', () => Promise.resolve('nunca'))).toEqual({ acquired: false });
    expect(client.released).toEqual([false]);
  });

  it('a PRÓPRIA consulta pg_try_advisory_lock falha (timeout, rede): a conexão é DESTRUÍDA, porque o servidor pode ter concedido a trava e a sessão ainda a teria', async () => {
    const { client, locks } = fakeClient([{ match: /pg_try_advisory_lock/, result: fails('statement timeout') }]);
    await expect(locks.tryRun('k', () => Promise.resolve('nunca'))).rejects.toThrow('statement timeout');
    expect(client.released).toEqual([true]);
  });

  it('o unlock falha: a conexão é destruída (o PostgreSQL solta a trava ao fechar a sessão)', async () => {
    const { client, locks } = fakeClient([{ match: /pg_try_advisory_lock/, result: ok([{ ok: true }]) }, { match: /pg_advisory_unlock/, result: fails('conexão fechada') }]);
    await locks.tryRun('k', () => Promise.resolve(1));
    expect(client.released).toEqual([true]);
  });

  it('erro na conexão durante o trabalho: lost() avisa, o unlock é pulado e a conexão é destruída', async () => {
    const { client, locks } = fakeClient([{ match: /pg_try_advisory_lock/, result: ok([{ ok: true }]) }]);
    const seen: boolean[] = [];
    await locks.tryRun('k', (handle) => {
      seen.push(handle.lost());
      client.emit('error', new Error('terminated'));
      seen.push(handle.lost());
      return Promise.resolve();
    });
    expect(seen).toEqual([false, true]);
    expect(client.released).toEqual([true]);
  });
});
