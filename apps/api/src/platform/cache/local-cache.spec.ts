import { LocalTtlCache } from './local-cache.js';

describe('LocalTtlCache', () => {
  it('requisições simultâneas pela mesma chave dividem UM cálculo (single-flight)', async () => {
    const cache = new LocalTtlCache<number>();
    let calls = 0;
    const compute = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 42;
    };
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.get('k', 1_000, compute)));
    expect(results.every((value) => value === 42)).toBe(true);
    expect(calls).toBe(1);
  });

  it('dentro do TTL devolve o valor guardado; vencido, recalcula', async () => {
    vi.useFakeTimers();
    try {
      const cache = new LocalTtlCache<number>();
      let calls = 0;
      const compute = () => Promise.resolve(++calls);
      expect(await cache.get('k', 1_000, compute)).toBe(1);
      vi.advanceTimersByTime(900);
      expect(await cache.get('k', 1_000, compute)).toBe(1);
      vi.advanceTimersByTime(200);
      expect(await cache.get('k', 1_000, compute)).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('TTL 0 desliga o cache: toda chamada calcula (modo dos testes e2e)', async () => {
    const cache = new LocalTtlCache<number>();
    let calls = 0;
    const compute = () => Promise.resolve(++calls);
    await cache.get('k', 0, compute);
    await cache.get('k', 0, compute);
    expect(calls).toBe(2);
  });

  it('erro não é guardado: a próxima chamada tenta de novo; valor antigo continua servindo se já existia', async () => {
    const cache = new LocalTtlCache<string>();
    await expect(cache.get('k', 1_000, () => Promise.reject(new Error('banco fora')))).rejects.toThrow('banco fora');
    expect(await cache.get('k', 1_000, () => Promise.resolve('ok'))).toBe('ok');
  });

  it('respeita o teto de entradas', async () => {
    const cache = new LocalTtlCache<number>(3);
    for (let i = 0; i < 10; i++) await cache.get(`k${i}`, 1_000, () => Promise.resolve(i));
    let recomputed = 0;
    await cache.get('k0', 1_000, () => Promise.resolve(++recomputed));
    expect(recomputed).toBe(1);
  });
});
