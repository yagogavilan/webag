// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../../proxy';

beforeEach(() => {
  vi.stubEnv('ADMIN_HOST', 'admin.webag.com.br');
  vi.stubEnv('LOJISTA_HOST', 'lojista.webag.com.br');
});
afterEach(() => vi.unstubAllEnvs());

const get = (path: string, host: string) => proxy(new NextRequest(`http://${host}${path}`, { headers: { host } }));

describe('proxy.ts: separação de hosts (SEC-116)', () => {
  it('/lojista no host do admin e /admin no host do lojista: 404', async () => {
    expect((await get('/lojista/entrar', 'admin.webag.com.br')).status).toBe(404);
    expect((await get('/admin/entrar', 'lojista.webag.com.br')).status).toBe(404);
  });

  it('no host certo segue o fluxo normal (login público passa; área restrita manda para o login)', async () => {
    expect((await get('/admin/entrar', 'admin.webag.com.br')).status).toBe(200);
    const restricted = await get('/lojista/pedidos', 'lojista.webag.com.br');
    expect(restricted.status).toBe(307);
    expect(restricted.headers.get('location')).toContain('/lojista/entrar');
  });
});

describe('proxy.ts: páginas públicas de pagamento (SEC-106)', () => {
  it('/pagar/cartao só no host público, com CSP que admite o Mercado Pago e nada de sessão de painel', async () => {
    vi.stubEnv('PUBLIC_HOST', 'app.webag.com.br');
    expect((await get('/pagar/cartao?i=x', 'admin.webag.com.br')).status).toBe(404);
    expect((await get('/pagar/cartao?i=x', 'lojista.webag.com.br')).status).toBe(404);
    const ok = await get('/pagar/cartao?i=x', 'app.webag.com.br');
    expect(ok.status).toBe(200);
    const csp = ok.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://sdk.mercadopago.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(ok.headers.get('cache-control')).toBe('no-store');
  });

  it('os painéis não respondem no host público e a CSP deles não abre origem do Mercado Pago', async () => {
    vi.stubEnv('PUBLIC_HOST', 'app.webag.com.br');
    expect((await get('/admin/entrar', 'app.webag.com.br')).status).toBe(404);
    const panel = await get('/admin/entrar', 'admin.webag.com.br');
    expect(panel.headers.get('content-security-policy')).not.toContain('mercadopago');
  });
});
