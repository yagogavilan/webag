import type { Redis } from 'ioredis';
import { CacheService } from './cache.service.js';

/** ioredis falso em memória: só o que o `CacheService` usa. `failing` simula o Redis fora do ar. */
function fakeRedis(options: { failing?: boolean } = {}) {
  const store = new Map<string, string>();
  const calls = { get: 0, set: 0 };
  const fail = () => (options.failing ? Promise.reject(new Error('redis fora')) : undefined);
  const redis = {
    get: (key: string) => {
      calls.get += 1;
      return fail() ?? Promise.resolve(store.get(key) ?? null);
    },
    set: (key: string, value: string) => {
      calls.set += 1;
      return fail() ?? Promise.resolve(void store.set(key, value)).then(() => 'OK');
    },
    incr: (key: string) => fail() ?? Promise.resolve(void store.set(key, String(Number(store.get(key) ?? 0) + 1))).then(() => 1),
  };
  return { redis: redis as unknown as Redis, store, calls };
}

const slow = <T>(value: T, ms = 20) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('CacheService.wrap (Redis, single-flight)', () => {
  it('requisições simultâneas pela mesma chave vencida dividem UM cálculo (single-flight) e UMA gravação', async () => {
    const { redis, calls } = fakeRedis();
    const cache = new CacheService(redis);
    let computed = 0;
    const compute = async () => {
      computed += 1;
      return slow({ n: 42 });
    };
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.wrap('home', 'k', 30, compute)));
    expect(computed).toBe(1);
    expect(calls.set).toBe(1);
    expect(results.every((r) => r.n === 42)).toBe(true);
    // já gravado: a próxima leitura vem do Redis, sem calcular
    expect(await cache.wrap('home', 'k', 30, compute)).toEqual({ n: 42 });
    expect(computed).toBe(1);
  });

  it('chaves diferentes não se misturam e cada uma calcula a sua vez', async () => {
    const { redis } = fakeRedis();
    const cache = new CacheService(redis);
    const [a, b] = await Promise.all([cache.wrap('home', 'a', 30, () => slow('A')), cache.wrap('home', 'b', 30, () => slow('B'))]);
    expect([a, b]).toEqual(['A', 'B']);
  });

  it('o cálculo que falha propaga o erro a todos que esperavam, não grava nada e a próxima chamada tenta de novo (o inflight esvazia)', async () => {
    const { redis, calls } = fakeRedis();
    const cache = new CacheService(redis);
    let attempts = 0;
    const failing = async () => {
      attempts += 1;
      await slow(null);
      throw new Error('banco fora');
    };
    const settled = await Promise.allSettled(Array.from({ length: 5 }, () => cache.wrap('home', 'k', 30, failing)));
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    expect(attempts).toBe(1);
    expect(calls.set).toBe(0);
    expect(await cache.wrap('home', 'k', 30, () => Promise.resolve('ok'))).toBe('ok');
  });

  it('falha aberta: com o Redis fora do ar a leitura vai direto ao cálculo e devolve o valor (sem erro)', async () => {
    const { redis } = fakeRedis({ failing: true });
    const cache = new CacheService(redis);
    expect(await cache.wrap('home', 'k', 30, () => Promise.resolve('direto'))).toBe('direto');
  });

  it('`bump` torna as chaves antigas do namespace inalcançáveis (nova versão); TTL pode depender do valor', async () => {
    const { redis, store } = fakeRedis();
    const cache = new CacheService(redis);
    let version = 1;
    expect(await cache.wrap('feed', 'k', (value: number) => (value > 0 ? 60 : 5), () => Promise.resolve(version))).toBe(1);
    version = 2;
    expect(await cache.wrap('feed', 'k', 60, () => Promise.resolve(version))).toBe(1); // ainda em cache
    await cache.bump('feed');
    expect(await cache.wrap('feed', 'k', 60, () => Promise.resolve(version))).toBe(2);
    expect([...store.keys()].some((key) => key.startsWith('cache:feed:1:'))).toBe(true);
  });
});
