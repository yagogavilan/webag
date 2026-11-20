import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';
import { reviews } from '../src/platform/database/schema.js';

/** W.6: o Início e as Avaliações do lojista: resumo de avaliações e ranking dos mais vendidos. Banco real. */
describe('Lojista: resumo de avaliações e mais vendidos (W.6)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  const day = (offsetMs = 0) => new Date(Date.now() - 3 * 3_600_000 + offsetMs).toISOString().slice(0, 10);

  describe('GET /v1/stores/{id}/reviews/summary', () => {
    it('média (1 casa), total, distribuição de 1 a 5 e sem resposta; só as publicadas; só o dono da loja', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }]);
      const empty = (await ctx.http.get(`/v1/stores/${shop.store.id}/reviews/summary`).set(bearer(shop.store.owner.accessToken)).expect(200)).body;
      expect(empty).toEqual({ average: null, total: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, withoutReply: 0 });
      const author = await createCustomer(ctx);
      const rows = [
        { rating: 5, storeReply: 'Obrigado!' },
        { rating: 5, storeReply: null },
        { rating: 4, storeReply: 'Valeu' },
        { rating: 1, storeReply: null },
        { rating: 3, storeReply: null },
      ];
      for (const r of rows) await ctx.db.insert(reviews).values({ storeId: shop.store.id, userId: author.userId, rating: r.rating, comment: 'ok', storeReply: r.storeReply });
      await ctx.db.insert(reviews).values({ storeId: shop.store.id, userId: author.userId, rating: 1, comment: 'removida', status: 'removed' }); // não conta
      const summary = (await ctx.http.get(`/v1/stores/${shop.store.id}/reviews/summary`).set(bearer(shop.store.owner.accessToken)).expect(200)).body;
      expect(summary).toEqual({ average: 3.6, total: 5, distribution: { '1': 1, '2': 0, '3': 1, '4': 1, '5': 2 }, withoutReply: 3 });
      // o mesmo universo da lista do painel
      expect((await ctx.http.get(`/v1/stores/${shop.store.id}/reviews?limit=50`).set(bearer(shop.store.owner.accessToken)).expect(200)).body.data).toHaveLength(summary.total);
      // outra loja e visitante
      const other = await shopWith(ctx, [{ name: 'Outro', priceCents: 1_000, stock: 1 }]);
      expect([403, 404]).toContain((await ctx.http.get(`/v1/stores/${shop.store.id}/reviews/summary`).set(bearer(other.store.owner.accessToken))).status);
      await ctx.http.get(`/v1/stores/${shop.store.id}/reviews/summary`).expect(401);
      await ctx.http.get(`/v1/stores/${shop.store.id}/reviews/summary`).set(bearer(author.accessToken)).expect(404);
    });
  });

  describe('GET /v1/stores/{id}/finance/sales/top-products', () => {
    async function sell(shop: Awaited<ReturnType<typeof shopWith>>, variantIndex: number, quantity: number) {
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[variantIndex]!, quantity).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      return orderRow(ctx, created.id);
    }
    const url = (storeId: string, extra = '') => `/v1/stores/${storeId}/finance/sales/top-products?from=${day(-86_400_000)}&to=${day(86_400_000)}${extra}`;

    it('ranking por unidades com o "você recebe" (líquido antes da tarifa do provedor); pedido cancelado fica fora; limit de 1 a 20', async () => {
      const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 50 }, { name: 'Bermuda', priceCents: 12_000, stock: 50 }, { name: 'Meia', priceCents: 1_500, stock: 50 }]);
      const a = await sell(shop, 0, 2);
      const b = await sell(shop, 1, 1);
      const c = await sell(shop, 0, 1);
      const cancelledBuyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, cancelledBuyer.user, shop.variants[2]!, 7).expect(200);
      const cancelled = (await placeOrder(ctx, cancelledBuyer.user, cancelledBuyer.addressId)).body as { id: string };
      await approve(ctx, cancelledBuyer.user, (await attemptOf(ctx, cancelled.id)).id);
      await ctx.http.post(`/v1/orders/${cancelled.id}/cancel`).set(bearer(cancelledBuyer.user.accessToken)).send({}).expect(200);

      const res = (await ctx.http.get(url(shop.store.id)).set(bearer(shop.store.owner.accessToken)).expect(200)).body;
      expect(res.data.map((p: { name: string; units: number }) => [p.name, p.units])).toEqual([['Camiseta', 3], ['Bermuda', 1]]);
      const net = (o: { finance: unknown }) => (o.finance as { merchantNetBeforeProviderFeeCents: number }).merchantNetBeforeProviderFeeCents;
      expect(res.data[0].youReceive).toEqual({ amount: net(a) + net(c), currency: 'BRL' });
      expect(res.data[1].youReceive).toEqual({ amount: net(b), currency: 'BRL' });
      expect(res.data[0]).toMatchObject({ productId: expect.any(String), image: { urls: expect.any(Object) } });
      expect((await ctx.http.get(url(shop.store.id, '&limit=1')).set(bearer(shop.store.owner.accessToken)).expect(200)).body.data).toHaveLength(1);
      await ctx.http.get(url(shop.store.id, '&limit=0')).set(bearer(shop.store.owner.accessToken)).expect(400);
      await ctx.http.get(url(shop.store.id, '&limit=21')).set(bearer(shop.store.owner.accessToken)).expect(400);
      // fora do período: vazio
      expect((await ctx.http.get(`/v1/stores/${shop.store.id}/finance/sales/top-products?from=2001-01-01&to=2001-01-31`).set(bearer(shop.store.owner.accessToken)).expect(200)).body.data).toEqual([]);
    });

    it('só a loja do dono com a permissão de valores; outra loja e visitante não', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }]);
      const other = await shopWith(ctx, [{ name: 'Outro', priceCents: 1_000, stock: 1 }]);
      await ctx.http.get(url(shop.store.id)).expect(401);
      expect([403, 404]).toContain((await ctx.http.get(url(shop.store.id)).set(bearer(other.store.owner.accessToken))).status);
      await ctx.http.get(url(shop.store.id)).set(bearer(shop.store.owner.accessToken)).expect(200);
    });
  });
});
