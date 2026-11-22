// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** SEC-219 com `COOKIE_SECURE=true` (produção): o nome vira `__Host-` e um cookie plantado por outro painel não é aceito. */
const STORE = '11111111-1111-4111-8111-111111111111';
const VIEW = '22222222-2222-4222-8222-222222222222';
const TOKEN = `vas_${'A1b2C3d4'.repeat(5)}abc`;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('COOKIE_SECURE', 'true');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const req = (method: string, url: string, cookie: string, body?: unknown) =>
  new NextRequest(`http://localhost:3001${url}`, { method, headers: { 'x-webag-client': 'web', cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const value = (expiresAt = Date.now() + 20 * 60_000) => `${TOKEN}|${VIEW}|${STORE}|${expiresAt}|Loja%20do%20atacante`;

describe('cookie da visão em produção (COOKIE_SECURE=true)', () => {
  it('o open grava __Host-wb_admin_vas com Secure, HttpOnly, SameSite=Strict, Path=/ e sem Domain', async () => {
    const { POST } = await import('../../app/api/view-as/open/route');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: VIEW, token: TOKEN, storeId: STORE, storeName: 'Moda', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const res = await POST(req('POST', '/api/view-as/open', '__Host-wb_admin_at=at', { storeId: STORE, reason: { code: 'merchant_support' } }));
    expect(res.status).toBe(201);
    const raw = res.headers.getSetCookie().find((c) => c.includes('wb_admin_vas'))!;
    expect(raw.startsWith('__Host-wb_admin_vas=')).toBe(true);
    expect(raw).toMatch(/; Secure/i);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=strict/i);
    expect(raw).toMatch(/Path=\/(;|$)/);
    expect(raw).not.toMatch(/Domain=/i);
  });

  it('cookie plantado por um painel irmão (nome antigo __Secure- ou sem prefixo) não é aceito, mesmo com sessão de admin', async () => {
    const { GET } = await import('../../app/api/view-as/session/route');
    for (const name of ['__Secure-wb_admin_vas', 'wb_admin_vas']) {
      const res = await GET(req('GET', '/api/view-as/session', `__Host-wb_admin_at=at; ${name}=${value()}`));
      expect(await res.json()).toEqual({ active: false });
    }
  });

  it('o __Host- com sessão de admin vale; sem a sessão (só cookie da visão), não', async () => {
    const { GET } = await import('../../app/api/view-as/session/route');
    const ok = await GET(req('GET', '/api/view-as/session', `__Host-wb_admin_at=at; __Host-wb_admin_vas=${value()}`));
    expect(await ok.json()).toMatchObject({ active: true, id: VIEW, storeId: STORE });
    const none = await GET(req('GET', '/api/view-as/session', `__Host-wb_admin_vas=${value()}`));
    expect(await none.json()).toEqual({ active: false });
  });

  it('leitura com cookie plantado (sem prefixo): VIEW_AS_EXPIRED e nenhuma chamada à API', async () => {
    const { GET } = await import('../../app/api/view-as/read/[...path]/route');
    const res = await GET(req('GET', `/api/view-as/read/stores/${STORE}/orders`, `__Host-wb_admin_at=at; wb_admin_vas=${value()}`), { params: Promise.resolve({ path: ['stores', STORE, 'orders'] }) });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
