// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as proxyPost, GET as proxyGet } from '../../app/api/proxy/[area]/[...path]/route';
import { POST as logout } from '../../app/api/session/[area]/logout/route';
import * as endRoute from '../../app/api/view-as/end/route';
import { POST as openView } from '../../app/api/view-as/open/route';
import * as readRoute from '../../app/api/view-as/read/[...path]/route';
import { GET as sessionState } from '../../app/api/view-as/session/route';

const STORE = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const VIEW = '22222222-2222-4222-8222-222222222222';
const TOKEN = `vas_${'A1b2C3d4'.repeat(5)}abc`; // 43 caracteres base64url
const ADMIN_AT = 'admin-access-token';

const fetchMock = vi.fn();
const logs = { log: vi.spyOn(console, 'log'), info: vi.spyOn(console, 'info'), warn: vi.spyOn(console, 'warn'), error: vi.spyOn(console, 'error'), debug: vi.spyOn(console, 'debug') };
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  for (const spy of Object.values(logs)) spy.mockClear().mockImplementation(() => undefined);
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' } });
const apiHeaders = (n: number) => (fetchMock.mock.calls[n]![1] as RequestInit).headers as Headers;
const apiUrl = (n: number) => String(fetchMock.mock.calls[n]![0]);
const setCookies = (res: Response) => res.headers.getSetCookie();
const expiresInMs = (ms: number) => new Date(Date.now() + ms).toISOString();

function req(method: string, url: string, init: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'x-webag-client': 'web', ...(init.headers ?? {}), ...(init.cookie ? { cookie: init.cookie } : {}) };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost:3001${url}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

/** Abre uma visão de verdade pela rota e devolve o cabeçalho `cookie` que o navegador mandaria depois (ida e volta do Set-Cookie). */
async function openAndGetCookie(storeId = STORE) {
  fetchMock.mockResolvedValueOnce(json(201, { id: VIEW, token: TOKEN, storeId, storeName: 'Moda | Morato', expiresAt: expiresInMs(30 * 60_000), reason: { code: 'merchant_support' } }));
  const res = await openView(req('POST', '/api/view-as/open', { cookie: `wb_admin_at=${ADMIN_AT}`, body: { storeId, reason: { code: 'merchant_support' } } }));
  const raw = setCookies(res).find((c) => c.startsWith('wb_admin_vas='))!;
  const pair = raw.split(';')[0]!;
  return { res, raw, cookie: `wb_admin_at=${ADMIN_AT}; ${pair}` };
}
const readCtx = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });

describe('abrir a visão (BFF)', () => {
  it('guarda a credencial só em cookie httpOnly/Strict com Path restrito; o corpo da resposta não a leva', async () => {
    const { res, raw } = await openAndGetCookie();
    expect(res.status).toBe(201);
    const body = await res.text();
    expect(body).not.toContain('vas_');
    expect(body).not.toContain('token');
    expect(JSON.parse(body)).toMatchObject({ id: VIEW, storeId: STORE, storeName: 'Moda | Morato' });
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=strict/i);
    expect(raw).toMatch(/Path=\/api\/view-as(;|$)/);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(raw)![1]);
    expect(maxAge).toBeGreaterThan(1700);
    expect(maxAge).toBeLessThanOrEqual(1800);
    // A API recebeu o Bearer do admin e só o motivo; a credencial não existe ainda.
    expect(apiUrl(0)).toContain(`/v1/admin/stores/${STORE}/view-as`);
    expect(apiHeaders(0).get('authorization')).toBe(`Bearer ${ADMIN_AT}`);
    expect(apiHeaders(0).get('x-view-as')).toBeNull();
  });

  it('só repassa os campos conhecidos do motivo e valida a loja e o código antes de chamar a API', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: VIEW, token: TOKEN, storeId: STORE, storeName: null, expiresAt: expiresInMs(60_000) }));
    await openView(req('POST', '/api/view-as/open', { cookie: `wb_admin_at=${ADMIN_AT}`, body: { storeId: STORE, reason: { code: 'other', note: 'Lojista sem acesso', admin: true }, extra: 'x' } }));
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({ reason: { code: 'other', note: 'Lojista sem acesso' } });
    fetchMock.mockClear();
    for (const body of [{ storeId: 'nao-e-uuid', reason: { code: 'other' } }, { storeId: STORE, reason: { code: 'root' } }, { storeId: STORE }, {}]) {
      const res = await openView(req('POST', '/api/view-as/open', { cookie: `wb_admin_at=${ADMIN_AT}`, body }));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('429, 403 e 422 passam como vieram, sem cookie', async () => {
    for (const status of [429, 403, 422]) {
      fetchMock.mockResolvedValueOnce(json(status, { status, code: 'X', title: 'x' }));
      const res = await openView(req('POST', '/api/view-as/open', { cookie: `wb_admin_at=${ADMIN_AT}`, body: { storeId: STORE, reason: { code: 'merchant_support' } } }));
      expect(res.status).toBe(status);
      expect(setCookies(res).some((c) => c.startsWith('wb_admin_vas='))).toBe(false);
    }
  });

  it('exige o cabeçalho do cliente (CSRF)', async () => {
    const res = await openView(new NextRequest('http://localhost:3001/api/view-as/open', { method: 'POST', headers: { cookie: `wb_admin_at=${ADMIN_AT}`, 'content-type': 'application/json' }, body: JSON.stringify({ storeId: STORE, reason: { code: 'other', note: 'x' } }) }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('estado da visão', () => {
  it('devolve id, loja, nome e fim, nunca a credencial; sem cookie, inativo', async () => {
    const { cookie } = await openAndGetCookie();
    const res = await sessionState(req('GET', '/api/view-as/session', { cookie }));
    const text = await res.text();
    expect(text).not.toContain('vas_');
    expect(JSON.parse(text)).toMatchObject({ active: true, id: VIEW, storeId: STORE, storeName: 'Moda | Morato' });
    const none = await sessionState(req('GET', '/api/view-as/session'));
    expect(await none.json()).toEqual({ active: false });
  });

  it('cookie vencido ou adulterado vale como sem visão', async () => {
    const res = await sessionState(req('GET', '/api/view-as/session', { cookie: `wb_admin_vas=${TOKEN}|${VIEW}|${STORE}|${Date.now() - 1000}|x` }));
    expect(await res.json()).toEqual({ active: false });
    const forged = await sessionState(req('GET', '/api/view-as/session', { cookie: `wb_admin_vas=vas_curto|${VIEW}|${STORE}|${Date.now() + 60_000}|x` }));
    expect(await forged.json()).toEqual({ active: false });
  });
});

describe('leituras da visão (BFF)', () => {
  it('só GET: o módulo não exporta escrita', () => {
    expect(Object.keys(readRoute).sort()).toEqual(['GET']);
    expect(Object.keys(endRoute).sort()).toEqual(['POST']);
  });

  it('põe o Bearer do admin e o X-View-As do cookie; a resposta volta sem a credencial e sem cache', async () => {
    const { cookie } = await openAndGetCookie();
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(json(200, { data: [], nextCursor: null }));
    const res = await readRoute.GET(req('GET', `/api/view-as/read/stores/${STORE}/orders?cursor=abc`, { cookie }), readCtx(`stores/${STORE}/orders`));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(apiUrl(0)).toContain(`/v1/stores/${STORE}/orders?cursor=abc`);
    expect(apiHeaders(0).get('authorization')).toBe(`Bearer ${ADMIN_AT}`);
    expect(apiHeaders(0).get('x-view-as')).toBe(TOKEN);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('GET');
    expect(await res.text()).not.toContain('vas_');
  });

  it('as 13 rotas da lista fechada passam; documentos, equipe, financeiro, cupons e rotas de admin não (404 sem chamar a API)', async () => {
    const { cookie } = await openAndGetCookie();
    const allowed = ['', '/settings', '/products', '/products/table', '/sections', '/orders', '/orders/counts', '/exchanges', '/reviews/summary', '/reviews', `/products/${OTHER}`, `/orders/${OTHER}`, `/exchanges/${OTHER}`];
    expect(allowed).toHaveLength(13);
    for (const suffix of allowed) {
      fetchMock.mockClear().mockResolvedValueOnce(json(200, {}));
      const res = await readRoute.GET(req('GET', '/api/view-as/read/x', { cookie }), readCtx(`stores/${STORE}${suffix}`));
      expect(res.status, suffix).toBe(200);
    }
    fetchMock.mockClear();
    for (const suffix of ['/documents', '/team', '/finance', '/coupons', '/orders/' + OTHER + '/ticket', '/products/import', '/payment-account', '/exports', '/../admin/stores', '/orders/counts/extra']) {
      const res = await readRoute.GET(req('GET', '/api/view-as/read/x', { cookie }), readCtx(`stores/${STORE}${suffix}`));
      expect(res.status, suffix).toBe(404);
    }
    for (const path of ['admin/stores', 'me', 'auth/logout', `admin/stores/${STORE}/view-as`]) {
      const res = await readRoute.GET(req('GET', '/api/view-as/read/x', { cookie }), readCtx(path));
      expect(res.status, path).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('visão de outra loja, ausente ou vencida: VIEW_AS_EXPIRED sem chamar a API', async () => {
    const { cookie } = await openAndGetCookie();
    fetchMock.mockClear();
    const other = await readRoute.GET(req('GET', '/api/view-as/read/x', { cookie }), readCtx(`stores/${OTHER}/orders`));
    expect(other.status).toBe(403);
    expect((await other.json()).code).toBe('VIEW_AS_EXPIRED');
    const none = await readRoute.GET(req('GET', '/api/view-as/read/x', { cookie: `wb_admin_at=${ADMIN_AT}` }), readCtx(`stores/${STORE}/orders`));
    expect(none.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('VIEW_AS_EXPIRED da API apaga o cookie da visão', async () => {
    const { cookie } = await openAndGetCookie();
    fetchMock.mockClear().mockResolvedValueOnce(json(403, { status: 403, code: 'VIEW_AS_EXPIRED', title: 'x' }));
    const res = await readRoute.GET(req('GET', '/api/view-as/read/x', { cookie }), readCtx(`stores/${STORE}/orders`));
    expect(res.status).toBe(403);
    expect(setCookies(res).find((c) => c.startsWith('wb_admin_vas='))).toMatch(/Max-Age=0/i);
  });

  it('sessão do admin perdida (401 sem renovação): apaga a sessão E a visão', async () => {
    const { cookie } = await openAndGetCookie();
    fetchMock.mockClear().mockResolvedValue(json(401, { status: 401, code: 'UNAUTHORIZED', title: 'x' }));
    const res = await readRoute.GET(req('GET', '/api/view-as/read/x', { cookie: `${cookie}; wb_admin_rt=refresh-velho` }), readCtx(`stores/${STORE}/orders`));
    const cleared = setCookies(res);
    expect(cleared.find((c) => c.startsWith('wb_admin_vas='))).toMatch(/Max-Age=0/i);
    expect(cleared.find((c) => c.startsWith('wb_admin_at='))).toMatch(/Max-Age=0/i);
  });
});

describe('encerrar e sair do painel', () => {
  it('"Sair da visualização" chama endViewAs com o Bearer, sem a credencial, e apaga o cookie', async () => {
    const { cookie } = await openAndGetCookie();
    fetchMock.mockClear().mockResolvedValueOnce(json(204, null));
    const res = await endRoute.POST(req('POST', '/api/view-as/end', { cookie }));
    expect(res.status).toBe(204);
    expect(apiUrl(0)).toContain(`/v1/admin/view-as/${VIEW}/end`);
    expect(apiHeaders(0).get('authorization')).toBe(`Bearer ${ADMIN_AT}`);
    expect(apiHeaders(0).get('x-view-as')).toBeNull();
    expect(setCookies(res).find((c) => c.startsWith('wb_admin_vas='))).toMatch(/Max-Age=0/i);
  });

  it('apaga o cookie mesmo com a API fora', async () => {
    const { cookie } = await openAndGetCookie();
    fetchMock.mockClear().mockRejectedValueOnce(new Error('offline'));
    const res = await endRoute.POST(req('POST', '/api/view-as/end', { cookie }));
    expect(res.status).toBe(204);
    expect(setCookies(res).find((c) => c.startsWith('wb_admin_vas='))).toMatch(/Max-Age=0/i);
  });

  it('o logout do admin apaga a visão junto com a sessão', async () => {
    fetchMock.mockResolvedValue(json(204, null));
    const res = await logout(req('POST', '/api/session/admin/logout', { cookie: `wb_admin_at=${ADMIN_AT}; wb_admin_vas=x` }), { params: Promise.resolve({ area: 'admin' }) });
    expect(setCookies(res).find((c) => c.startsWith('wb_admin_vas='))).toMatch(/Max-Age=0/i);
  });
});

describe('o proxy comum nunca vira caminho da visão', () => {
  it('não repassa um X-View-As vindo do navegador e não deixa o admin ler rotas de loja por ele', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await proxyGet(req('GET', '/api/proxy/admin/admin/stores', { cookie: `wb_admin_at=${ADMIN_AT}`, headers: { 'x-view-as': TOKEN } }), { params: Promise.resolve({ area: 'admin', path: ['admin', 'stores'] }) });
    expect(apiHeaders(0).get('x-view-as')).toBeNull();
    fetchMock.mockClear();
    const res = await proxyPost(req('POST', `/api/proxy/admin/stores/${STORE}/products`, { cookie: `wb_admin_at=${ADMIN_AT}`, headers: { 'x-view-as': TOKEN }, body: {} }), { params: Promise.resolve({ area: 'admin', path: ['stores', STORE, 'products'] }) });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a credencial não vai para log', () => {
  it('nenhum console.* recebeu a credencial em nenhum dos fluxos', async () => {
    const { cookie } = await openAndGetCookie();
    fetchMock.mockResolvedValue(json(500, { status: 500, code: 'X', title: 'x' }));
    await readRoute.GET(req('GET', '/api/view-as/read/x', { cookie }), readCtx(`stores/${STORE}/orders`));
    await endRoute.POST(req('POST', '/api/view-as/end', { cookie }));
    const printed = JSON.stringify(Object.values(logs).flatMap((spy) => spy.mock.calls));
    expect(printed).not.toContain('vas_');
    expect(printed).not.toContain(TOKEN);
  });
});
