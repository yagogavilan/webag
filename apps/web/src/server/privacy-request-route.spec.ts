// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/public/privacy-request/route';

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

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('http://app.webag.com.br/api/public/privacy-request', { method: 'POST', headers: { host: 'app.webag.com.br', 'content-type': 'application/json', 'x-webag-client': 'web', ...headers }, body: JSON.stringify(body) }));
const valid = { type: 'deletion', email: 'ana@exemplo.com', message: 'Não consigo entrar.' };
const receipt = { protocol: 'PV-0031', dueAt: '2026-12-04T12:00:00.000Z' };

describe('POST /api/public/privacy-request (WB-214, SEC-152)', () => {
  it('repassa o pedido sem credencial e devolve só protocolo e prazo, igual para qualquer e-mail', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ...receipt, extra: 'nao-deve-sair' }), { status: 202, headers: { 'content-type': 'application/json' } }));
    const known = await post(valid);
    const unknown = await post({ ...valid, email: 'ninguem@exemplo.com' });
    expect(known.status).toBe(202);
    expect(await known.json()).toEqual(receipt);
    expect(unknown.status).toBe(202);
    expect(await unknown.json()).toEqual(receipt);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v1/privacy/requests');
    expect(new Headers((init as RequestInit).headers).get('authorization')).toBeNull();
    expect(known.headers.get('cache-control')).toBe('no-store');
  });

  it('recusa host de painel, falta do cabeçalho de cliente, origem de outro site e corpo inválido', async () => {
    expect((await post(valid, { host: 'admin.webag.com.br' })).status).toBe(404);
    expect((await post(valid, { 'x-webag-client': '' })).status).toBe(403);
    expect((await post(valid, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post(valid, { origin: 'https://outro-site.example' })).status).toBe(403);
    expect((await post({ ...valid, email: 'sem-arroba' })).status).toBe(400);
    expect((await post({ ...valid, type: 'hack' })).status).toBe(400);
    expect((await post({ ...valid, message: 'x'.repeat(1001) })).status).toBe(400);
    expect((await post({ ...valid, role: 'admin' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limite da API vira 429 com Retry-After; qualquer outra falha vira 503 genérico, sem vazar o corpo da API', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '3600' } }));
    const limited = await post(valid);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('3600');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'USER_DELETED', detail: 'conta existe' }), { status: 409 }));
    const failed = await post(valid);
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain('conta existe');
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await post(valid)).status).toBe(503);
  });
});
