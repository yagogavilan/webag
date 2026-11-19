import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { banners, couponRedemptions, coupons, homeHighlights, products } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, uploadBannerImage } from './helpers/fixtures.js';
import { addToCart, customerAt, shopWith } from './helpers/orders.js';

const DAY = 86_400_000;

describe('Marketing do admin: cupons da plataforma, destaques e métricas de banner (O6.3, WB-115, WB-116)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let finance: Awaited<ReturnType<typeof createAdmin>>;
  let support: Awaited<ReturnType<typeof createAdmin>>;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ops = await createAdmin(ctx, 'operations');
    finance = await createAdmin(ctx, 'finance');
    support = await createAdmin(ctx, 'support');
  });
  afterAll(() => ctx.close());

  const code = () => `PL${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const body = (over: Record<string, unknown> = {}) => ({ code: code(), kind: 'percent', value: 10, minOrderCents: 0, maxUses: 1_000, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 7 * DAY).toISOString(), ...over });
  const create = (payload: Record<string, unknown>, token = ops.accessToken) => ctx.http.post('/v1/admin/coupons').set(bearer(token)).send(payload);

  describe('cupons da plataforma', () => {
    it('permissões: operação e super criam; financeiro só lê; suporte e cliente não veem', async () => {
      await ctx.http.get('/v1/admin/coupons').expect(401);
      await ctx.http.get('/v1/admin/coupons').set(bearer(support.accessToken)).expect(403);
      await ctx.http.get('/v1/admin/coupons').set(bearer((await createCustomer(ctx)).accessToken)).expect(403);
      await ctx.http.get('/v1/admin/coupons').set(bearer(finance.accessToken)).expect(200);
      await create(body(), finance.accessToken).expect(403);
      const made = (await create(body()).expect(201)).body;
      await ctx.http.patch(`/v1/admin/coupons/${made.id}`).set(bearer(finance.accessToken)).send({ active: false }).expect(403);
    });

    it('cria com validação, código em maiúsculas e único, aviso do corte na taxa Webag; lista só os da plataforma', async () => {
      const c = code();
      const made = (await create(body({ code: c.toLowerCase(), kind: 'percent', value: 15, percentCapCents: 2_000, maxUses: 100, firstPurchaseOnly: true })).expect(201)).body;
      expect(made).toMatchObject({ code: c, kind: 'percent', value: 15, percentCapCents: 2_000, maxUses: 100, firstPurchaseOnly: true, status: 'live', uses: 0, discountTotal: { amount: 0, currency: 'BRL' }, orders: 0, active: true });
      expect(made.notice).toMatch(/taxa Webag/);
      expect((await create(body({ code: c })).expect(409)).body.code).toBe('COUPON_CODE_TAKEN');
      await create(body({ code: 'abc' })).expect(400);
      await create(body({ code: 'COM ESPACO' })).expect(400);
      await create(body({ kind: 'percent', value: 101 })).expect(400);
      await create(body({ kind: 'fixed', value: 0 })).expect(400);
      await create(body({ kind: 'free_shipping', value: 5 })).expect(400);
      await create(body({ kind: 'fixed', value: 500, percentCapCents: 100 })).expect(400);
      await create(body({ endsAt: new Date(Date.now() - DAY).toISOString() })).expect(400);
      await create(body({ extra: 1 })).expect(400);
      // DT-059 / DEC-060: TODO cupom da plataforma exige teto de usos
      const { maxUses: _omitted, ...noCap } = body();
      void _omitted;
      const missing = await create(noCap);
      expect(missing.status).toBe(400);
      expect(JSON.stringify(missing.body)).toContain('maxUses');
      expect((await create(body({ maxUses: null }))).status).toBe(400);
      expect((await create(body({ maxUses: 0 }))).status).toBe(400);
      const fixedCost = (await create(body({ kind: 'fixed', value: 700, maxUses: 40 })).expect(201)).body;
      expect(fixedCost.maxCost).toEqual({ amount: 28_000, currency: 'BRL' }); // 40 usos x R$ 7,00
      expect((await create(body({ kind: 'percent', value: 10, percentCapCents: 1_500, maxUses: 10 })).expect(201)).body.maxCost).toEqual({ amount: 15_000, currency: 'BRL' });
      expect((await create(body({ kind: 'percent', value: 10, maxUses: 10 })).expect(201)).body.maxCost).toBeNull(); // sem teto por uso: não há custo máximo calculável
      expect((await ctx.http.patch(`/v1/admin/coupons/${fixedCost.id}`).set(bearer(ops.accessToken)).send({ maxUses: null })).status).toBe(400); // tirar o teto também é recusado
      expect((await create(body({ kind: 'free_shipping', value: 0 })).expect(201)).body).toMatchObject({ kind: 'free_shipping', value: 0 });
      expect((await create(body({ startsAt: new Date(Date.now() + DAY).toISOString(), endsAt: new Date(Date.now() + 3 * DAY).toISOString() })).expect(201)).body.status).toBe('scheduled');

      // O cupom de uma LOJA não aparece nem abre pelo admin da plataforma.
      const shop = await shopWith(ctx, [{ name: 'Item Cupom', priceCents: 5_000, stock: 5 }]);
      const [storeCoupon] = await ctx.db.insert(coupons).values({ code: code(), kind: 'fixed', scope: 'store', storeId: shop.store.id, value: 100, startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY) }).returning();
      const list = (await ctx.http.get(`/v1/admin/coupons?q=${storeCoupon!.code}`).set(bearer(ops.accessToken)).expect(200)).body;
      expect(list.data).toEqual([]);
      await ctx.http.get(`/v1/admin/coupons/${storeCoupon!.id}`).set(bearer(ops.accessToken)).expect(404);
      expect((await ctx.http.get(`/v1/admin/coupons?q=${c.slice(0, 6)}`).set(bearer(ops.accessToken)).expect(200)).body.data.map((x: { code: string }) => x.code)).toContain(c);
      await ctx.http.get('/v1/admin/coupons/nao-uuid').set(bearer(ops.accessToken)).expect(404);
    });

    it('usos e desconto total vêm das resgates; depois do 1º uso valor e tipo travam; pausar vale na hora (o carrinho recusa); prorrogar e limite', async () => {
      const made = (await create(body({ kind: 'fixed', value: 500, maxUses: 3 })).expect(201)).body as { id: string; code: string };
      const shop = await shopWith(ctx, [{ name: 'Item C2', priceCents: 5_000, stock: 9 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const apply = () => ctx.http.put(`/v1/cart/coupon?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).send({ code: made.code });
      expect((await apply()).status).toBe(200); // vale
      await ctx.http.patch(`/v1/admin/coupons/${made.id}`).set(bearer(ops.accessToken)).send({ active: false }).expect(200);
      expect((await apply()).status).toBeGreaterThanOrEqual(400); // pausar vale imediatamente (C4)
      await ctx.http.patch(`/v1/admin/coupons/${made.id}`).set(bearer(ops.accessToken)).send({ active: true }).expect(200);

      await ctx.db.insert(couponRedemptions).values([
        { couponId: made.id, userId: buyer.user.userId, orderId: randomUUID(), discountCents: 500 },
        { couponId: made.id, userId: buyer.user.userId, orderId: randomUUID(), discountCents: 400 },
        { couponId: made.id, userId: buyer.user.userId, orderId: randomUUID(), discountCents: 500, releasedAt: new Date() }, // devolvido: não conta
      ]);
      const detail = (await ctx.http.get(`/v1/admin/coupons/${made.id}`).set(bearer(ops.accessToken)).expect(200)).body;
      expect(detail).toMatchObject({ uses: 2, discountTotal: { amount: 900 }, orders: 2, status: 'live' });
      expect((await ctx.http.get(`/v1/admin/coupons?status=live&q=${made.code}`).set(bearer(finance.accessToken)).expect(200)).body.data[0]).toMatchObject({ id: made.id, uses: 2 });

      expect((await ctx.http.patch(`/v1/admin/coupons/${made.id}`).set(bearer(ops.accessToken)).send({ value: 900 })).body.code).toBe('COUPON_IN_USE');
      await ctx.http.patch(`/v1/admin/coupons/${made.id}`).set(bearer(ops.accessToken)).send({ maxUses: 1 }).expect(400); // já teve 2 usos
      const extended = (await ctx.http.patch(`/v1/admin/coupons/${made.id}`).set(bearer(ops.accessToken)).send({ endsAt: new Date(Date.now() + 30 * DAY).toISOString(), maxUses: 2, minOrderCents: 3_000 }).expect(200)).body;
      expect(extended).toMatchObject({ maxUses: 2, minOrderCents: 3_000, status: 'exhausted' }); // 2 de 2: esgotado
      await ctx.http.patch(`/v1/admin/coupons/${made.id}`).set(bearer(ops.accessToken)).send({ code: 'OUTROCODE' }).expect(400);
      await ctx.http.patch(`/v1/admin/coupons/${randomUUID()}`).set(bearer(ops.accessToken)).send({ active: false }).expect(404);
      const audit = (await ctx.http.get('/v1/admin/audit-log?action=coupon.paused').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body.data as { targetId: string }[];
      expect(audit.some((a) => a.targetId === made.id)).toBe(true);
    });
  });

  describe('destaques da Início', () => {
    it('só item ativo; aparece na home antes dos automáticos, só para quem enxerga a loja; some quando inativa; permissões dos banners', async () => {
      const shop = await shopWith(ctx, [{ name: 'Destaque Produto', priceCents: 7_000, stock: 5 }]);
      const farShop = await shopWith(ctx, [{ name: 'Outro', priceCents: 1_000, stock: 5 }]);
      const post = (payload: Record<string, unknown>, token = ops.accessToken) => ctx.http.post('/v1/admin/highlights').set(bearer(token)).send(payload);
      const window = { startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + DAY).toISOString() };
      await ctx.http.get('/v1/admin/highlights').expect(401);
      await ctx.http.get('/v1/admin/highlights').set(bearer((await createCustomer(ctx)).accessToken)).expect(403);
      await post({ kind: 'store', targetId: shop.store.id, ...window }, support.accessToken).expect(403); // suporte lê, não escreve
      await post({ kind: 'store', targetId: randomUUID(), ...window }).expect(400); // inexistente
      await post({ kind: 'store', targetId: shop.store.id, startsAt: window.endsAt, endsAt: window.startsAt }).expect(400);
      await post({ kind: 'store', targetId: shop.store.id, cityId: randomUUID(), ...window }).expect(400);

      const h = (await post({ kind: 'store', targetId: shop.store.id, position: 0, ...window }).expect(201)).body;
      expect(h).toMatchObject({ kind: 'store', targetId: shop.store.id, live: true, targetUnavailable: false });
      const hp = (await post({ kind: 'product', targetId: shop.store.productIds[0], position: 1, ...window }).expect(201)).body;
      expect(hp.targetName).toBe('Destaque Produto');
      const home = async (origin = shop.origin) => (await ctx.http.get(`/v1/home?lat=${origin.lat}&lng=${origin.lng}`).expect(200)).body;
      const seen = await home();
      expect(seen.highlightStores.map((s: { id: string }) => s.id)).toEqual([shop.store.id]);
      expect(seen.highlightProducts.map((p: { id: string }) => p.id)).toEqual([shop.store.productIds[0]]);
      // Quem está longe da loja (fora do raio) não vê o destaque: o item precisa estar visível naquele ponto (RN-03).
      expect((await home(farShop.origin)).highlightStores.map((s: { id: string }) => s.id)).not.toContain(shop.store.id);

      // Período vencido / pausado / loja inativada: some do app sozinho.
      await ctx.http.patch(`/v1/admin/highlights/${h.id}`).set(bearer(ops.accessToken)).send({ active: false }).expect(200);
      expect((await home()).highlightStores).toEqual([]);
      await ctx.db.update(products).set({ status: 'paused' }).where(eq(products.id, shop.store.productIds[0]!));
      await ctx.http.get('/v1/admin/highlights').set(bearer(support.accessToken)).expect(200);
      const listed = (await ctx.http.get('/v1/admin/highlights').set(bearer(ops.accessToken)).expect(200)).body.data as { id: string; targetUnavailable: boolean; live: boolean }[];
      expect(listed.find((x) => x.id === hp.id)).toMatchObject({ targetUnavailable: true, live: false });
      await ctx.http.delete(`/v1/admin/highlights/${hp.id}`).set(bearer(ops.accessToken)).expect(204);
      await ctx.http.delete(`/v1/admin/highlights/${hp.id}`).set(bearer(ops.accessToken)).expect(404);
      expect(await ctx.db.select().from(homeHighlights).where(eq(homeHighlights.id, hp.id))).toHaveLength(0);
    });
  });

  describe('impressões e cliques do banner (WB-115 C5)', () => {
    it('o app avisa impressão e clique; só conta banner no ar; a lista mostra totais e a taxa de cliques', async () => {
      const imageAssetId = await uploadBannerImage(ctx, ops);
      const live = (await ctx.http.post('/v1/admin/banners').set(bearer(ops.accessToken)).send({ title: 'Banner métricas', imageAssetId, destinationType: 'none', startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + DAY).toISOString() }).expect(201)).body as { id: string };
      const event = (id: string, type: string) => ctx.http.post(`/v1/banners/${id}/events`).send({ type });
      for (let i = 0; i < 4; i += 1) await event(live.id, 'impression').expect(204);
      await event(live.id, 'click').expect(204);
      await event(live.id, 'tap').expect(400);
      await event('nao-uuid', 'click').expect(404);
      const row = (await ctx.http.get('/v1/admin/banners').set(bearer(ops.accessToken)).expect(200)).body.data.find((b: { id: string }) => b.id === live.id);
      expect(row).toMatchObject({ impressions: 4, clicks: 1, ctrPct: 25 });
      // Fora do ar (pausado): não conta.
      await ctx.db.update(banners).set({ active: false }).where(eq(banners.id, live.id));
      await event(live.id, 'impression').expect(204);
      expect((await ctx.db.select().from(banners).where(eq(banners.id, live.id)))[0]).toMatchObject({ impressions: 4, clicks: 1 });
    });
  });
});
