// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callApi, clientHints } from './upstream';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const forged = new Headers({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '7.7.7.7', 'user-agent': 'ua' });
const sentHeaders = () => (fetchMock.mock.calls[0]![1] as RequestInit).headers as Headers;

describe('IP do cliente enviado à API (SEC-114)', () => {
  it('X-Forwarded-For forjado pelo navegador é ignorado: nada é repassado', async () => {
    await callApi('/v1/auth/login', { method: 'POST', body: '{}', hints: clientHints(forged) });
    expect(sentHeaders().get('x-forwarded-for')).toBeNull();
  });

  it('com 1 proxy confiável, repassa o IP que ele anexou e não o forjado', async () => {
    vi.stubEnv('WEB_TRUSTED_PROXY_HOPS', '1');
    const headers = new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' });
    await callApi('/v1/auth/login', { method: 'POST', body: '{}', hints: clientHints(headers) });
    expect(sentHeaders().get('x-forwarded-for')).toBe('203.0.113.9');
  });

  it('com cabeçalho de proxy configurado, usa só ele', async () => {
    vi.stubEnv('WEB_CLIENT_IP_HEADER', 'X-Real-IP');
    await callApi('/v1/auth/login', { method: 'POST', body: '{}', hints: clientHints(new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6' })) });
    expect(sentHeaders().get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('envia o segredo do BFF à API quando configurado', async () => {
    vi.stubEnv('BFF_SHARED_SECRET', 's3cr3t');
    await callApi('/v1/me', { hints: clientHints(forged) });
    expect(sentHeaders().get('x-webag-bff-secret')).toBe('s3cr3t');
  });

  it('sem segredo configurado, não envia o cabeçalho', async () => {
    await callApi('/v1/me');
    expect(sentHeaders().get('x-webag-bff-secret')).toBeNull();
  });
});
