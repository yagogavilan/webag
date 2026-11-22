import { errors } from '../http/app-error.js';
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

  it('erro sem valor antigo não é guardado: propaga e a próxima chamada tenta de novo', async () => {
    const cache = new LocalTtlCache<string>();
    await expect(cache.get('k', 1_000, () => Promise.reject(new Error('banco fora')))).rejects.toThrow('banco fora');
    expect(await cache.get('k', 1_000, () => Promise.resolve('ok'))).toBe('ok');
  });

  describe('com valor antigo e o recálculo falhando (stale-if-error)', () => {
    afterEach(() => vi.useRealTimers());

    it('serve o valor antigo (não o erro) para quem disparou e para quem chega depois, e recua ~1 s antes de tentar de novo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const cache = new LocalTtlCache<string>();
      await cache.get('k', 1_000, () => Promise.resolve('antigo'));
      vi.setSystemTime(Date.now() + 1_500); // vencido
      let calls = 0;
      const failing = () => {
        calls += 1;
        return Promise.reject(new Error('banco fora'));
      };
      expect(await cache.get('k', 1_000, failing)).toBe('antigo');
      expect(await cache.get('k', 1_000, failing)).toBe('antigo');
      expect(await cache.get('k', 1_000, failing)).toBe('antigo');
      expect(calls).toBe(1); // recuo: sem uma consulta ao banco por requisição
      vi.setSystemTime(Date.now() + 1_100);
      expect(await cache.get('k', 1_000, () => Promise.resolve('novo'))).toBe('novo'); // banco voltou: valor novo
    });

    it('erro de NEGÓCIO (AppError: 404 de loja suspensa/produto removido) nunca é mascarado pelo valor antigo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const cache = new LocalTtlCache<string>();
      await cache.get('k', 1_000, () => Promise.resolve('antigo'));
      vi.setSystemTime(Date.now() + 1_500);
      await expect(cache.get('k', 1_000, () => Promise.reject(errors.notFound('Loja não encontrada.')))).rejects.toMatchObject({ status: 404 });
      await expect(cache.get('k', 1_000, () => Promise.reject(errors.notFound('Loja não encontrada.')))).rejects.toMatchObject({ status: 404 }); // nada ficou guardado
    });

    it('não serve valor velho demais: passado 4x o TTL o erro propaga', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const cache = new LocalTtlCache<string>();
      await cache.get('k', 1_000, () => Promise.resolve('antigo'));
      vi.setSystemTime(Date.now() + 5_000);
      await expect(cache.get('k', 1_000, () => Promise.reject(new Error('banco fora')))).rejects.toThrow('banco fora');
    });
  });

  it('respeita o teto de entradas', async () => {
    const cache = new LocalTtlCache<number>(3);
    for (let i = 0; i < 10; i++) await cache.get(`k${i}`, 1_000, () => Promise.resolve(i));
    let recomputed = 0;
    await cache.get('k0', 1_000, () => Promise.resolve(++recomputed));
    expect(recomputed).toBe(1);
  });
});
