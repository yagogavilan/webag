import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, customerAt, shopWith } from './helpers/orders.js';
import { restoreFees } from './helpers/fees.js';

/** W.5 (WB-257): prévia de entrega do lojista com a MESMA conta do checkout (`computeEta`), antes de salvar o preparo. */
describe('POST /v1/stores/{id}/delivery-preview (W.5)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    await restoreFees(ctx);
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });

  const preview = (shop: Awaited<ReturnType<typeof shopWith>>, body: Record<string, unknown>) => ctx.http.post(`/v1/stores/${shop.store.id}/delivery-preview`).set(bearer(shop.store.owner.accessToken)).send(body);

  it('para o mesmo par loja x endereço, a prévia é IGUAL à faixa da sacola (mesma conta); com o preparo do formulário a faixa anda junto', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const cart = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    const saved = (await preview(shop, { lat: shop.origin.lat, lng: shop.origin.lng }).expect(200)).body;
    expect(saved.available).toBe(true);
    expect(saved.eta.fromMin).toBe(cart.delivery.eta.minMinutes);
    expect(saved.eta.toMin).toBe(cart.delivery.eta.maxMinutes);
    expect(saved.etaRange).toMatchObject({ minMinutes: saved.eta.fromMin, maxMinutes: saved.eta.toMin });
    expect(saved.eta).toMatchObject({ prepMin: saved.prepMin, dispatchMin: 15, bandMin: 15 });
    expect(saved.eta.estimateMin).toBe(saved.eta.prepMin + saved.eta.dispatchMin + saved.eta.travelMin);
    expect(Math.abs(saved.distanceM - 800)).toBeLessThan(40);
    expect(saved.fee).toEqual({ amount: expect.any(Number), currency: 'BRL' });
    // preparo do formulário (não salvo): +10 min no preparo = +10 min na faixa, e o alcance encolhe
    const slower = (await preview(shop, { lat: shop.origin.lat, lng: shop.origin.lng, prepMin: saved.prepMin + 10 }).expect(200)).body;
    expect(slower.eta.fromMin).toBe(saved.eta.fromMin + 10);
    expect(slower.eta.toMin).toBe(saved.eta.toMin + 10);
    expect(slower.reachKm).toBeLessThan(saved.reachKm);
    // a prévia NÃO salva nada: a sacola continua com o preparo antigo
    const again = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    expect(again.delivery.eta.minMinutes).toBe(cart.delivery.eta.minMinutes);
  });

  it('distância direta em km, fora do alcance e preparo grande demais', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
    const near = (await preview(shop, { distanceKm: 2 }).expect(200)).body;
    expect(near).toMatchObject({ available: true, distanceM: 2000, reason: null });
    expect(near.reachKm).toBeGreaterThan(2);
    const far = (await preview(shop, { distanceKm: 40 }).expect(200)).body;
    expect(far).toMatchObject({ available: false, reason: 'OUT_OF_RANGE', distanceM: 40_000 });
    // o preparo mais alto que a folga deixa a loja sem alcance: reachKm 0 e `maxPrepMin` diz o limite
    const huge = (await preview(shop, { distanceKm: 1, prepMin: 120 }).expect(200)).body;
    expect(huge.available).toBe(false);
    expect(huge.reachKm).toBe(0);
    expect(huge.maxPrepMin).toBeLessThan(120);
  });

  it('validação e acesso: exatamente um entre ponto e distância; preparo de 5 a 120; só o dono da loja', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
    const other = await shopWith(ctx, [{ name: 'Outro', priceCents: 1_000, stock: 1 }]);
    expect((await preview(shop, {})).status).toBe(400);
    expect((await preview(shop, { distanceKm: 1, lat: -23.2, lng: -46.7 })).status).toBe(400);
    expect((await preview(shop, { lat: -23.2 })).status).toBe(400);
    expect((await preview(shop, { distanceKm: 1, prepMin: 4 })).status).toBe(400);
    expect((await preview(shop, { distanceKm: 1, extra: true })).status).toBe(400);
    await ctx.http.post(`/v1/stores/${shop.store.id}/delivery-preview`).send({ distanceKm: 1 }).expect(401);
    expect([403, 404]).toContain((await ctx.http.post(`/v1/stores/${shop.store.id}/delivery-preview`).set(bearer(other.store.owner.accessToken)).send({ distanceKm: 1 })).status);
    await ctx.http.post('/v1/stores/nao-uuid/delivery-preview').set(bearer(shop.store.owner.accessToken)).send({ distanceKm: 1 }).expect(404);
  });
});
