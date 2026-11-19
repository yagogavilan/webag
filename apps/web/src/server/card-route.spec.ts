// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/pay/card/route';

const TOKEN = 'tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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
  POST(new Request('http://app.webag.com.br/api/pay/card', { method: 'POST', headers: { host: 'app.webag.com.br', 'content-type': 'application/json', 'x-webag-client': 'web', ...headers }, body: JSON.stringify(body) }));
const valid = { intent: TOKEN, card: { token: 'mp_card_token_123', installments: 1 } };

describe('POST /api/pay/card', () => {
  it('repassa só o token do cartão à API, sem credencial de painel', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ orderId: 'o1' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const response = await post(valid);
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(`/v1/card-intents/${TOKEN}/pay`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ card: valid.card });
    expect(new Headers((init as RequestInit).headers).get('authorization')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('recusa host de painel, ausência do cabeçalho de cliente e corpo com campo de cartão', async () => {
    expect((await post(valid, { host: 'admin.webag.com.br' })).status).toBe(404);
    expect((await post(valid, { 'x-webag-client': '' })).status).toBe(403);
    expect((await post({ ...valid, card: { ...valid.card, number: '4111111111111111' } })).status).toBe(400);
    expect((await post({ ...valid, intent: 'curto' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devolve o problema da API (recusado, link usado) sem alterar o status', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PAYMENT_DECLINED', status: 422, title: 'x' }), { status: 422, headers: { 'content-type': 'application/problem+json' } }));
    const response = await post(valid);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'PAYMENT_DECLINED' });
  });
});
