import { randomUUID } from 'node:crypto';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { isolatedPoint, makeStore, northOf } from './helpers/discovery.js';
import { createCustomer, ensureLegalDocs } from './helpers/fixtures.js';

/**
 * I3 do review de desempenho (2026-11-22): `Cache-Control: private, no-store` é o padrão GLOBAL (LGPD: resposta pessoal nunca fica em cache
 * compartilhado nem em disco). Só rota pública que declara o próprio cabeçalho (@Header) o troca; erro dessas rotas volta ao padrão.
 */
describe('Cache-Control global: no-store nas rotas autenticadas, público só onde declarado (I3, LGPD)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('rotas autenticadas (sacola, endereços, perfil, pedidos): `private, no-store`, também nos erros 401 e 404', async () => {
    const user = await createCustomer(ctx);
    const auth = bearer(user.accessToken);
    for (const path of ['/v1/cart', '/v1/me/addresses', '/v1/me', '/v1/orders']) {
      const res = await ctx.http.get(path).set(auth).expect(200);
      expect(res.headers['cache-control'], path).toBe('private, no-store');
    }
    const noToken = await ctx.http.get('/v1/cart').expect(401);
    expect(noToken.headers['cache-control']).toBe('private, no-store');
    const notFound = await ctx.http.get(`/v1/orders/${randomUUID()}`).set(auth).expect(404);
    expect(notFound.headers['cache-control']).toBe('private, no-store');
  });

  it('rota pública que declara o cabeçalho mantém o dela (`public, max-age=30`); 404 dessa mesma rota volta a `private, no-store`', async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Cabecalho', at: await northOf(ctx, origin, 800) });
    const ok = await ctx.http.get(`/v1/browse/stores/${store.id}/products`).expect(200);
    expect(ok.headers['cache-control']).toBe('public, max-age=30');
    // erro de rota pública NUNCA pode ser cacheável por proxy (um 404 transitório ficaria preso)
    const missing = await ctx.http.get(`/v1/browse/stores/${randomUUID()}/products`).expect(404);
    expect(missing.headers['cache-control']).toBe('private, no-store');
    const missingStore = await ctx.http.get(`/v1/browse/stores/${randomUUID()}`).expect(404);
    expect(missingStore.headers['cache-control']).toBe('private, no-store');
    // com posição a página é por aparelho (privada), sem cache compartilhado
    const withPoint = await ctx.http.get(`/v1/browse/stores/${store.id}?lat=${origin.lat}&lng=${origin.lng}`).expect(200);
    expect(withPoint.headers['cache-control']).toBe('private, max-age=30');
  });

  it('rota pública: ETag e 304 com `If-None-Match` continuam funcionando (o `no-store` não os remove; só impede o armazenamento)', async () => {
    const first = await ctx.http.get('/v1/categories').expect(200);
    expect(first.headers['cache-control']).toBe('public, max-age=60');
    const etag = String(first.headers.etag);
    expect(etag).toMatch(/^W\//);
    const again = await ctx.http.get('/v1/categories').set('If-None-Match', etag).expect(304);
    expect(again.text ?? '').toBe('');

    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Etag', at: await northOf(ctx, origin, 800) });
    const list = await ctx.http.get(`/v1/browse/stores/${store.id}/products`).expect(200);
    await ctx.http.get(`/v1/browse/stores/${store.id}/products`).set('If-None-Match', String(list.headers.etag)).expect(304);
  });

  it('cabeçalhos de segurança acompanham todas as respostas (nosniff, sem referrer, sem frame)', async () => {
    const res = await ctx.http.get('/v1/categories').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
