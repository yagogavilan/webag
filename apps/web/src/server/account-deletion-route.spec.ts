// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/public/account-deletion/[step]/route';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('PUBLIC_HOST', 'app.webag.com.br');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const post = (step: string, body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request(`http://app.webag.com.br/api/public/account-deletion/${step}`, { method: 'POST', headers: { host: 'app.webag.com.br', 'content-type': 'application/json', 'x-webag-client': 'web', ...headers }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ step }),
  });
const upstream = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const TICKET = 'x'.repeat(43);

describe('POST /api/public/account-deletion/<passo> (WB-214, SEC-166, SEC-176)', () => {
  it('recusa host de painel, passo desconhecido, falta do cabeçalho de cliente, origem de outro site e corpo inválido, sem chamar a API', async () => {
    expect((await post('start', { email: 'a@b.co' }, { host: 'admin.webag.com.br' })).status).toBe(404);
    expect((await post('delete-everything', { email: 'a@b.co' })).status).toBe(404);
    expect((await post('start', { email: 'a@b.co' }, { 'x-webag-client': '' })).status).toBe(403);
    expect((await post('start', { email: 'a@b.co' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post('start', { email: 'a@b.co' }, { origin: 'https://outro-site.example' })).status).toBe(403);
    expect((await post('start', { email: 'sem-arroba' })).status).toBe(400);
    expect((await post('start', { email: 'a@b.co', role: 'admin' })).status).toBe(400);
    expect((await post('verify-code', { email: 'a@b.co', code: '12' })).status).toBe(400);
    expect((await post('review', { deleteTicket: 'curto' })).status).toBe(400);
    expect((await post('cancel', { email: 'a@b.co' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('via A: repassa sem credencial, responde igual para qualquer e-mail e sempre sem cache', async () => {
    fetchMock.mockImplementation(async () => upstream(200, { sent: true, extra: 'nao-deve-sair' }));
    const known = await post('start', { email: 'ana@exemplo.com' });
    const unknown = await post('start', { email: 'ninguem@exemplo.com' });
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual({ sent: true });
    expect(await unknown.json()).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v1/auth/account-deletion/start');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
    expect(known.headers.get('cache-control')).toBe('no-store');
    expect(known.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('via B: devolve só o ticket e o prazo; senha errada, e-mail inexistente e admin dão a mesma resposta', async () => {
    fetchMock.mockResolvedValueOnce(upstream(200, { deleteTicket: TICKET, expiresIn: 600, userId: 'u-1' }));
    const ok = await post('start', { email: 'ana@exemplo.com', password: 'certa' });
    expect(await ok.json()).toEqual({ deleteTicket: TICKET, expiresIn: 600 });
    const bodies: string[] = [];
    for (const detail of ['senha errada', 'e-mail inexistente', 'conta de admin']) {
      fetchMock.mockResolvedValueOnce(upstream(401, { code: 'INVALID_CREDENTIALS', detail }));
      const response = await post('start', { email: 'x@exemplo.com', password: 'errada' });
      expect(response.status).toBe(401);
      bodies.push(JSON.stringify(await response.json()));
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toMatch(/admin|inexistente|errada/);
  });

  it('SEC-176: senha certa com a conta sob ataque vira 403 LOGIN_CODE_REQUIRED; no cancelamento o código segue no corpo', async () => {
    fetchMock.mockResolvedValueOnce(upstream(403, { code: 'LOGIN_CODE_REQUIRED', detail: 'qualquer coisa' }));
    const response = await post('start', { email: 'ana@exemplo.com', password: 'certa' });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('LOGIN_CODE_REQUIRED');
    fetchMock.mockResolvedValueOnce(upstream(204));
    const cancelled = await post('cancel', { email: 'ana@exemplo.com', password: 'certa', code: '482913' });
    expect(cancelled.status).toBe(204);
    expect(JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body))).toEqual({ email: 'ana@exemplo.com', password: 'certa', code: '482913' });
  });

  it('código errado e vencido mantêm o código estável; 403 de outro motivo não vaza (vira 503 genérico)', async () => {
    fetchMock.mockResolvedValueOnce(upstream(400, { code: 'CODE_INVALID' }));
    expect((await (await post('verify-code', { email: 'a@b.co', code: '123456' })).json()).code).toBe('CODE_INVALID');
    fetchMock.mockResolvedValueOnce(upstream(400, { code: 'CODE_EXPIRED' }));
    expect((await (await post('cancel', { email: 'a@b.co', password: 'x', code: '123456' })).json()).code).toBe('CODE_EXPIRED');
    fetchMock.mockResolvedValueOnce(upstream(403, { code: 'ADMIN_ACCOUNT_NOT_DELETABLE', detail: 'a conta é de admin' }));
    const other = await post('start', { email: 'a@b.co', password: 'x' });
    expect(other.status).toBe(503);
    expect(JSON.stringify(await other.json())).not.toContain('admin');
  });

  it('revisão e confirmação: reduz a resposta aos campos conhecidos; bloqueios saem sem campos extras; 410 e 409', async () => {
    fetchMock.mockResolvedValueOnce(upstream(200, { canDelete: false, blockers: [{ kind: 'order', id: 'o1', number: '4821', status: 'saiu para entrega', userId: 'segredo' }], hasPassword: true, ownsStore: false, anonymizationDays: 30, fiscalRetentionYears: 5, regretHours: 72, internal: 'x' }));
    const review = await (await post('review', { deleteTicket: TICKET })).json();
    expect(review).toEqual({ canDelete: false, blockers: [{ kind: 'order', id: 'o1', number: '4821', status: 'saiu para entrega' }], ownsStore: false, anonymizationDays: 30, fiscalRetentionYears: 5, regretHours: 72 });
    fetchMock.mockResolvedValueOnce(upstream(409, { code: 'DELETION_BLOCKED', blockers: [{ kind: 'exchange', id: 'e1', number: 'TR-1', status: 'aprovada', userId: 'segredo' }] }));
    const blocked = await post('finish', { deleteTicket: TICKET });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ code: 'DELETION_BLOCKED', blockers: [{ kind: 'exchange', id: 'e1', number: 'TR-1', status: 'aprovada' }] });
    fetchMock.mockResolvedValueOnce(upstream(410, { code: 'DELETE_TICKET_INVALID' }));
    expect((await post('finish', { deleteTicket: TICKET })).status).toBe(410);
    fetchMock.mockResolvedValueOnce(upstream(200, { status: 'pending', effectiveAt: '2026-11-22T12:00:00.000Z', cancelableUntil: '2026-11-22T12:00:00.000Z', userId: 'x' }));
    expect(await (await post('finish', { deleteTicket: TICKET })).json()).toEqual({ status: 'pending', effectiveAt: '2026-11-22T12:00:00.000Z', cancelableUntil: '2026-11-22T12:00:00.000Z' });
  });

  it('limite vira 429 com Retry-After; resposta fora do contrato e falha de rede viram 503', async () => {
    fetchMock.mockResolvedValueOnce(upstream(429, {}, { 'retry-after': '3600' }));
    const limited = await post('start', { email: 'a@b.co' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('3600');
    fetchMock.mockResolvedValueOnce(upstream(200, { qualquer: 'coisa' }));
    expect((await post('start', { email: 'a@b.co' })).status).toBe(503);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await post('start', { email: 'a@b.co' })).status).toBe(503);
  });
});
