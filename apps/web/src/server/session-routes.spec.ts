// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '../../app/api/session/[area]/login/route';
import { POST as mfa } from '../../app/api/session/[area]/mfa/route';
import { POST as proxyPost } from '../../app/api/proxy/[area]/[...path]/route';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const problem = (status: number, code: string) => json(status, { status, code, title: code });
const TOKENS = { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 };
const ADMIN_ME = { id: 'u1', adminProfile: 'super_admin' };

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3001${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webag-client': 'web', ...headers },
    body: JSON.stringify(body),
  });
}
const ctx = (area: string, path?: string[]) => ({ params: Promise.resolve({ area, path: path ?? [] }) });
const apiCall = (n: number) => ({ url: String(fetchMock.mock.calls[n]![0]), init: fetchMock.mock.calls[n]![1] as RequestInit });
const apiHeaders = (n: number) => apiCall(n).init.headers as Headers;
const cookieHeader = (res: Response) => res.headers.getSetCookie().join('\n');

describe('SEC-114: o BFF não repassa o IP escolhido pelo navegador', () => {
  it('login com X-Forwarded-For forjado: a API não recebe o valor forjado', async () => {
    fetchMock.mockResolvedValue(problem(401, 'INVALID_CREDENTIALS'));
    const forged = { 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '7.7.7.7' };
    const res = await login(post('/api/session/admin/login', { email: 'a@b.c', password: 'x' }, forged), ctx('admin'));
    expect(res.status).toBe(401);
    expect(apiHeaders(0).get('x-forwarded-for')).toBeNull();
  });

  it('com 1 proxy confiável a API recebe o IP anexado por ele, mesmo com valor forjado antes', async () => {
    vi.stubEnv('WEB_TRUSTED_PROXY_HOPS', '1');
    fetchMock.mockResolvedValue(problem(401, 'INVALID_CREDENTIALS'));
    await login(post('/api/session/admin/login', { email: 'a@b.c', password: 'x' }, { 'x-forwarded-for': '6.6.6.6, 198.51.100.4' }), ctx('admin'));
    expect(apiHeaders(0).get('x-forwarded-for')).toBe('198.51.100.4');
  });

  it('o proxy da API também ignora o X-Forwarded-For forjado', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await proxyPost(post('/api/proxy/admin/me/password', {}, { 'x-forwarded-for': '6.6.6.6', cookie: 'wb_admin_at=at' }), ctx('admin', ['me', 'password']));
    expect(apiHeaders(0).get('x-forwarded-for')).toBeNull();
  });
});

describe('SEC-115: login do admin em 2 passos', () => {
  it('senha certa de admin com TOTP: devolve só mfaRequired e guarda o mfaToken em cookie HttpOnly', async () => {
    fetchMock.mockResolvedValue(json(200, { mfaRequired: true, mfaToken: 'tok-123456789012345678901', expiresIn: 300 }));
    const res = await login(post('/api/session/admin/login', { email: 'a@b.c', password: 'x' }), ctx('admin'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mfaRequired: true });
    const cookie = cookieHeader(res);
    expect(cookie).toContain('wb_admin_mfa=tok-123456789012345678901');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=300/i);
    expect(cookie).not.toContain('wb_admin_at');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('totpCode no corpo do login é recusado (caminho legado de 1 passo morreu)', async () => {
    const res = await login(post('/api/session/admin/login', { email: 'a@b.c', password: 'x', totpCode: '123456' }), ctx('admin'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('desafio de 2º fator no painel do lojista responde como senha errada, sem cookie', async () => {
    fetchMock.mockResolvedValue(json(200, { mfaRequired: true, mfaToken: 'tok-123456789012345678901', expiresIn: 300 }));
    const res = await login(post('/api/session/lojista/login', { email: 'a@b.c', password: 'x' }), ctx('lojista'));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_CREDENTIALS');
    expect(cookieHeader(res)).toBe('');
  });

  it('SEC-121: admin sem TOTP no painel do lojista é recusado e a sessão é revogada', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { tokens: TOKENS, mfaSetupRequired: true })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const res = await login(post('/api/session/lojista/login', { email: 'a@b.c', password: 'x' }), ctx('lojista'));
    expect(res.status).toBe(401);
    expect(apiCall(1).url).toContain('/v1/auth/logout');
    expect(cookieHeader(res)).toBe('');
  });

  it('2º passo: o mfaToken vem do cookie, o código do corpo; abre a sessão e apaga o cookie do desafio', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { tokens: TOKENS, mfaSetupRequired: false })).mockResolvedValueOnce(json(200, ADMIN_ME));
    const res = await mfa(post('/api/session/admin/mfa', { code: '123456' }, { cookie: 'wb_admin_mfa=tok-abc' }), ctx('admin'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mfaSetupRequired: false });
    expect(apiCall(0).url).toContain('/v1/auth/mfa/verify');
    expect(JSON.parse(apiCall(0).init.body as string)).toEqual({ mfaToken: 'tok-abc', code: '123456' });
    const cookie = cookieHeader(res);
    expect(cookie).toContain('wb_admin_at=at');
    expect(cookie).toContain('wb_admin_rt=rt');
    expect(cookie).toMatch(/wb_admin_mfa=;/);
  });

  it('o corpo não pode trazer o mfaToken (só o cookie vale)', async () => {
    const res = await mfa(post('/api/session/admin/mfa', { code: '123456', mfaToken: 'x'.repeat(30) }), ctx('admin'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem o cookie do desafio: 401 MFA_INVALID, sem chamar a API', async () => {
    const res = await mfa(post('/api/session/admin/mfa', { code: '123456' }), ctx('admin'));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('MFA_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('senha certa + código errado: repassa 401 MFA_INVALID e não abre sessão', async () => {
    fetchMock.mockResolvedValue(problem(401, 'MFA_INVALID'));
    const res = await mfa(post('/api/session/admin/mfa', { code: '000000' }, { cookie: 'wb_admin_mfa=tok-abc' }), ctx('admin'));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('MFA_INVALID');
    expect(cookieHeader(res)).not.toContain('wb_admin_at');
  });

  it('código de recuperação: abre a sessão de configuração do TOTP sem checar /me', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { tokens: TOKENS, mfaSetupRequired: true }));
    const res = await mfa(post('/api/session/admin/mfa', { code: 'ABCDE-12345' }, { cookie: 'wb_admin_mfa=tok-abc' }), ctx('admin'));
    expect(await res.json()).toEqual({ mfaSetupRequired: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('o 2º passo só existe para o admin', async () => {
    const res = await mfa(post('/api/session/lojista/mfa', { code: '123456' }, { cookie: 'wb_admin_mfa=tok-abc' }), ctx('lojista'));
    expect(res.status).toBe(404);
  });

  it('reset do admin: o resetTicket vai para cookie e sai do corpo; o complete o reenvia do cookie', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { tokens: null, mfaRequired: true, resetTicket: 'ticket-abc', expiresIn: 600 }));
    const first = await proxyPost(post('/api/proxy/admin/auth/password/reset', { email: 'a@b.c', code: '123456', newPassword: 'Nova-Senha-123' }), ctx('admin', ['auth', 'password', 'reset']));
    expect(await first.json()).toEqual({ mfaRequired: true });
    expect(cookieHeader(first)).toContain('wb_admin_reset=ticket-abc');

    fetchMock.mockResolvedValueOnce(json(200, { tokens: null }));
    const done = await proxyPost(
      post('/api/proxy/admin/auth/password/reset/complete', { totpCode: '123456', newPassword: 'Nova-Senha-123', resetTicket: 'forjado' }, { cookie: 'wb_admin_reset=ticket-abc' }),
      ctx('admin', ['auth', 'password', 'reset', 'complete']),
    );
    expect(done.status).toBe(200);
    expect(JSON.parse(apiCall(1).init.body as string)).toEqual({ resetTicket: 'ticket-abc', totpCode: '123456', newPassword: 'Nova-Senha-123' });
    expect(cookieHeader(done)).toMatch(/wb_admin_reset=;/);
  });

  it('O-2: reset de conta de admin no host do lojista não devolve o ticket ao JS nem grava cookie', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { tokens: null, mfaRequired: true, resetTicket: 'ticket-secreto', expiresIn: 600 }));
    const res = await proxyPost(post('/api/proxy/lojista/auth/password/reset', { email: 'a@b.c', code: '123456', newPassword: 'Nova-Senha-123' }), ctx('lojista', ['auth', 'password', 'reset']));
    const text = await res.text();
    expect(res.status).toBe(403);
    expect(text).not.toContain('ticket-secreto');
    expect(JSON.parse(text)).toMatchObject({ code: 'ADMIN_ACCOUNT_USE_ADMIN_PANEL' });
    expect(cookieHeader(res)).not.toContain('reset=');
  });

  it('reset/complete sem o cookie do ticket não chega à API; no lojista nem existe', async () => {
    const semTicket = await proxyPost(post('/api/proxy/admin/auth/password/reset/complete', { totpCode: '123456', newPassword: 'x' }), ctx('admin', ['auth', 'password', 'reset', 'complete']));
    expect(semTicket.status).toBe(401);
    const lojista = await proxyPost(post('/api/proxy/lojista/auth/password/reset/complete', { totpCode: '123456' }), ctx('lojista', ['auth', 'password', 'reset', 'complete']));
    expect(lojista.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SEC-116: rotas de sessão e proxy respeitam o host da área', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_HOST', 'admin.webag.com.br');
    vi.stubEnv('LOJISTA_HOST', 'lojista.webag.com.br');
  });

  it('login do admin no host do lojista (e o inverso) responde 404 sem chamar a API', async () => {
    const a = await login(post('/api/session/admin/login', { email: 'a@b.c', password: 'x' }, { host: 'lojista.webag.com.br' }), ctx('admin'));
    const l = await login(post('/api/session/lojista/login', { email: 'a@b.c', password: 'x' }, { host: 'admin.webag.com.br' }), ctx('lojista'));
    expect([a.status, l.status]).toEqual([404, 404]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxy admin no host do lojista: 404; o 2º passo também', async () => {
    const p = await proxyPost(post('/api/proxy/admin/me', {}, { host: 'lojista.webag.com.br' }), ctx('admin', ['me']));
    const m = await mfa(post('/api/session/admin/mfa', { code: '123456' }, { host: 'lojista.webag.com.br', cookie: 'wb_admin_mfa=tok' }), ctx('admin'));
    expect([p.status, m.status]).toEqual([404, 404]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no host certo funciona', async () => {
    fetchMock.mockResolvedValue(problem(401, 'INVALID_CREDENTIALS'));
    const res = await login(post('/api/session/admin/login', { email: 'a@b.c', password: 'x' }, { host: 'admin.webag.com.br' }), ctx('admin'));
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ticket de tempo real pelo BFF (DEC-045)', () => {
  it('repassa o ticket com o Bearer do cookie e acrescenta a origem pública do canal, sem expor o JWT', async () => {
    vi.stubEnv('REALTIME_URL', 'https://api.webag.com.br');
    vi.stubEnv('COOKIE_SECURE', 'false');
    fetchMock.mockResolvedValue(json(200, { ticket: 'tkt', expiresInSeconds: 60 }));
    const res = await proxyPost(post('/api/proxy/lojista/realtime/tickets', { scope: 'store', storeId: '11111111-1111-4111-8111-111111111111' }, { cookie: 'webag_lojista_at=at; webag_lojista_rt=rt' }), ctx('lojista', ['realtime', 'tickets']));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticket: 'tkt', expiresInSeconds: 60, url: 'https://api.webag.com.br' });
    expect(apiCall(0).url).toContain('/v1/realtime/tickets');
  });

  it('sem origem de canal em produção: 503 e nenhum ticket vaza ao navegador', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REALTIME_URL', '');
    fetchMock.mockResolvedValue(json(200, { ticket: 'tkt', expiresInSeconds: 60 }));
    const res = await proxyPost(post('/api/proxy/admin/realtime/tickets', { scope: 'admin' }), ctx('admin', ['realtime', 'tickets']));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('tkt');
  });
});
