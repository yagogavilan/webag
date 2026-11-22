import { LatencyRecorder, percentile, routeKey } from './latency.js';

describe('latência por rota', () => {
  it('percentil sobre lista ordenada', () => {
    const list = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(list, 50)).toBe(51);
    expect(percentile(list, 95)).toBe(96);
    expect(percentile([], 95)).toBe(0);
  });

  it('a chave é o modelo da rota, nunca a URL crua (sem id, sem coordenada)', () => {
    expect(routeKey({ method: 'GET', baseUrl: '', route: { path: '/v1/browse/stores/:storeId' }, path: '/v1/browse/stores/0a1b2c3d?lat=-23.2&lng=-46.7' } as never)).toBe('GET /v1/browse/stores/:storeId');
    expect(routeKey({ method: 'GET', baseUrl: '', route: undefined, path: '/socket.io/' } as never)).toBe('(socket.io)');
    expect(routeKey({ method: 'GET', baseUrl: '', route: undefined, path: '/nao-existe/123' } as never)).toBe('(sem rota)');
  });

  it('agrega p50/p95/p99, conta 5xx, ordena pela rota mais lenta e zera a janela', () => {
    const recorder = new LatencyRecorder();
    for (let i = 1; i <= 100; i++) recorder.record('GET /lenta', i, i === 100 ? 500 : 200);
    for (let i = 1; i <= 10; i++) recorder.record('GET /rapida', 1, 200);
    const [first, second] = recorder.snapshot();
    expect(first).toMatchObject({ route: 'GET /lenta', n: 100, p50: 51, p95: 96, max: 100, errors5xx: 1 });
    expect(second).toMatchObject({ route: 'GET /rapida', n: 10, p95: 1 });
    expect(recorder.snapshot()).toEqual([]);
  });

  it('limita a cardinalidade de rotas (rota nova além do teto é ignorada, não derruba a memória)', () => {
    const recorder = new LatencyRecorder();
    for (let i = 0; i < 400; i++) recorder.record(`GET /r${i}`, 1, 200);
    expect(recorder.snapshot()).toHaveLength(300);
  });
});
