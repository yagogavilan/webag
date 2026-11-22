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

  describe('invalidate (DEC-113: a entrada é APAGADA, não só vencida)', () => {
    afterEach(() => vi.useRealTimers());

    it('sem filtro apaga tudo; com filtro apaga só o que casa; a próxima leitura recalcula', async () => {
      const cache = new LocalTtlCache<string>();
      await cache.get('a', 60_000, () => Promise.resolve('a1'));
      await cache.get('b', 60_000, () => Promise.resolve('b1'));
      expect(cache.invalidate((key) => key === 'a')).toBe(1);
      expect(await cache.get('a', 60_000, () => Promise.resolve('a2'))).toBe('a2');
      expect(await cache.get('b', 60_000, () => Promise.resolve('b2'))).toBe('b1');
      expect(cache.invalidate()).toBe(2);
      expect(await cache.get('b', 60_000, () => Promise.resolve('b3'))).toBe('b3');
    });

    it('o filtro enxerga o valor guardado (para apagar por loja, p.ex.)', async () => {
      const cache = new LocalTtlCache<{ storeId: string }>();
      await cache.get('p1', 60_000, () => Promise.resolve({ storeId: 's1' }));
      await cache.get('p2', 60_000, () => Promise.resolve({ storeId: 's2' }));
      cache.invalidate((_key, value) => value?.storeId === 's1');
      let recomputed = 0;
      await cache.get('p1', 60_000, () => Promise.resolve({ storeId: String(++recomputed) }));
      await cache.get('p2', 60_000, () => Promise.resolve({ storeId: String(++recomputed) }));
      expect(recomputed).toBe(1);
    });

    it('stale-if-error NÃO ressuscita a entrada invalidada: o erro do banco propaga em vez de devolver o item retirado', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const cache = new LocalTtlCache<string>();
      await cache.get('k', 1_000, () => Promise.resolve('retirado'));
      vi.setSystemTime(Date.now() + 1_500); // vencido, mas ainda dentro de 4x o TTL: o stale-if-error serviria o valor antigo
      cache.invalidate();
      await expect(cache.get('k', 1_000, () => Promise.reject(new Error('banco fora')))).rejects.toThrow('banco fora');
    });

    it('invalidar com um cálculo em andamento: quem esperava recebe o resultado, mas ele NÃO fica guardado (nasceu antes da mudança)', async () => {
      const cache = new LocalTtlCache<string>();
      let release!: (value: string) => void;
      const slow = cache.get('k', 60_000, () => new Promise<string>((resolve) => (release = resolve)));
      cache.invalidate(); // a moderação gravou e invalidou enquanto o cálculo antigo ainda lia o banco
      release('lido-antes-da-mudanca');
      expect(await slow).toBe('lido-antes-da-mudanca');
      expect(await cache.get('k', 60_000, () => Promise.resolve('lido-depois'))).toBe('lido-depois');
    });

    it('invalidar durante o recálculo que falha também não serve o valor antigo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const cache = new LocalTtlCache<string>();
      await cache.get('k', 1_000, () => Promise.resolve('retirado'));
      vi.setSystemTime(Date.now() + 1_500);
      let fail!: (error: Error) => void;
      const recompute = cache.get('k', 1_000, () => new Promise<string>((_resolve, reject) => (fail = reject)));
      cache.invalidate();
      fail(new Error('banco fora'));
      await expect(recompute).rejects.toThrow('banco fora');
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
