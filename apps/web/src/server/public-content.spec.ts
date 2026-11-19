// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLegal, resetPublicContentCache } from './public-content';

const fetchMock = vi.fn();
const doc = { id: 'd1', type: 'privacy', version: 3, title: 'Política de privacidade', content: 'Texto', effectiveAt: '2026-11-01T03:00:00.000Z' };
const ok = () => new Response(JSON.stringify(doc), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  resetPublicContentCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('textos publicados (cache de 60 s)', () => {
  it('lê da API uma vez dentro do prazo', async () => {
    fetchMock.mockResolvedValue(ok());
    expect(await loadLegal('privacy')).toEqual({ status: 'ok', data: doc });
    await loadLegal('privacy');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('404 vira "missing" e falha vira "unavailable"', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }));
    expect(await loadLegal('privacy')).toEqual({ status: 'missing' });
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    expect(await loadLegal('customer_terms')).toEqual({ status: 'unavailable' });
    fetchMock.mockResolvedValueOnce(new Response('lixo', { status: 200 }));
    expect(await loadLegal('merchant_terms')).toEqual({ status: 'unavailable' });
  });

  it('com a API fora, serve a última cópia boa por até 1 hora', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(ok());
    await loadLegal('privacy');
    vi.advanceTimersByTime(5 * 60_000);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await loadLegal('privacy')).toEqual({ status: 'ok', data: doc });
    vi.advanceTimersByTime(2 * 60 * 60_000);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await loadLegal('privacy')).toEqual({ status: 'unavailable' });
  });
});
