import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHealth } from '../generated/client.js';
import { configureApiClient } from './api-fetch.js';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('cliente gerado + apiFetch', () => {
  it('prefixa a URL base configurada (sem barra duplicada) e devolve { data, status }', async () => {
    configureApiClient({ baseUrl: 'https://api.exemplo.test/' });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));

    const response = await getHealth();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.exemplo.test/health');
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ status: 'ok' });
  });

  it('aplica os cabeçalhos do provedor configurado', async () => {
    configureApiClient({ baseUrl: '', headers: () => ({ Authorization: 'Bearer t' }) });
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await getHealth();

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer t');
  });

  it('não tenta ler corpo em 204', async () => {
    configureApiClient({ baseUrl: '' });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await getHealth();

    expect(response.data).toBeUndefined();
  });
});
