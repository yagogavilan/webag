import { eq } from 'drizzle-orm';
import { DeliveriesService } from '../src/modules/logistics/index.js';
import { deliveries, paymentAlerts, storeSettings } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { restoreFees, useParam } from './helpers/fees.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { distanceM, isolatedPoint, makeStore, northOf, type TestPoint } from './helpers/discovery.js';
import { addToCart, approve, attemptOf, cartView, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

const q = (p: TestPoint, extra = '') => `lat=${p.lat}&lng=${p.lng}${extra}`;

/** E.1/E.2 (DEC-053): ETA = preparo + despacho + distância x 1,3 x 6 min/km; teto de 120 min; faixa de +-15 min. Banco real (PostGIS). */
describe('ETA de entrega em até 2 h (DEC-053)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    await restoreFees(ctx);
  });
  beforeEach(async () => {
    await ctx.redis.flushdb();
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });

  const home = async (p: TestPoint, extra = '') => (await ctx.http.get(`/v1/home?${q(p, extra)}`).expect(200)).body;
  const names = (list: { name: string }[]) => list.map((s) => s.name);

  it('a faixa vem do preparo da loja + despacho + deslocamento (distância PostGIS x 1,3 x 6) com folga de 15 min', async () => {
    const origin = isolatedPoint();
    const at = await northOf(ctx, origin, 5000);
    await makeStore(ctx, { name: 'Loja 5 km', at });
    const measured = await distanceM(ctx, origin, at); // a mesma medida do servidor (round)
    const travel = Math.ceil((Math.round(measured) / 1000) * 1.3 * 6 - 1e-9);
    const estimate = 20 + 15 + travel;
    const store = (await home(origin)).nearbyStores.find((s: { name: string }) => s.name === 'Loja 5 km');
    expect(store.delivery).toMatchObject({ available: true, etaMinMinutes: estimate - 15, etaMaxMinutes: estimate + 15, eta: { minMinutes: estimate - 15, maxMinutes: estimate + 15 } });
    expect(new Date(store.delivery.eta.toAt).getTime() - new Date(store.delivery.eta.fromAt).getTime()).toBe(30 * 60_000);
  });

  it('DEC-054, teto no FIM da faixa: 8,9 km entrega (fim 120), 9,05 km some da descoberta, da busca e da loja diz "fora da área"; 10,5 km não mostra faixa de 102 a 132', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Dentro do Teto', at: await northOf(ctx, origin, 8_900), products: [{ name: 'Pao Dentro' }] });
    const outAt = await northOf(ctx, origin, 9_050);
    const out = await makeStore(ctx, { name: 'Acima do Teto', at: outAt, products: [{ name: 'Pao Acima' }] });
    const far = await makeStore(ctx, { name: 'Longe 10km', at: await northOf(ctx, origin, 10_500), products: [{ name: 'Pao Longe' }] });
    const inside = (await home(origin)).nearbyStores as { name: string; delivery: { etaMaxMinutes: number } }[];
    expect(names(inside)).toEqual(['Dentro do Teto']);
    expect(inside[0]!.delivery.etaMaxMinutes).toBeLessThanOrEqual(120);
    expect(names((await ctx.http.get(`/v1/search/stores?${q(origin)}`).expect(200)).body.data)).toEqual(['Dentro do Teto']);
    expect(names((await ctx.http.get(`/v1/search/products?${q(origin, '&q=pao')}`).expect(200)).body.data)).toEqual(['Pao Dentro']);
    for (const store of [out, far]) {
      const page = (await ctx.http.get(`/v1/browse/stores/${store.id}?${q(origin)}`).expect(200)).body;
      expect(page.delivery).toMatchObject({ available: false, eta: null });
    }
    const [row] = await ctx.db.select().from(storeSettings).where(eq(storeSettings.storeId, out.id));
    expect(row?.prepMinutes).toBeNull();
  });

  it('o preparo da loja entra na conta: preparo alto empurra a mesma distância para fora do teto', async () => {
    const origin = isolatedPoint();
    const at = await northOf(ctx, origin, 8_000); // 8 km: 62,4 -> 63 min de deslocamento
    await makeStore(ctx, { name: 'Preparo Padrão', at, prepMinutes: 20 }); // fim da faixa: 20 + 15 + 63 + 15 = 113
    await makeStore(ctx, { name: 'Preparo Longo', at, prepMinutes: 40 }); // 40 + 15 + 63 + 15 = 133 > 120
    await makeStore(ctx, { name: 'Preparo Curto', at, prepMinutes: 5 });
    const list = (await home(origin)).nearbyStores as { name: string; delivery: { etaMinMinutes: number } }[];
    expect(names(list)).toEqual(['Preparo Curto', 'Preparo Padrão']); // ordenado pelo ETA, não só pela distância
    expect(list[1]!.delivery.etaMinMinutes - list[0]!.delivery.etaMinMinutes).toBe(15);
  });

  it('ordenação: a loja mais longe porém com preparo curto vem antes da mais perto com preparo longo (relevância e sort=eta)', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Perto e Lenta', at: await northOf(ctx, origin, 500), prepMinutes: 60 });
    await makeStore(ctx, { name: 'Longe e Rápida', at: await northOf(ctx, origin, 3000), prepMinutes: 5 });
    expect(names((await home(origin)).nearbyStores)).toEqual(['Longe e Rápida', 'Perto e Lenta']);
    expect(names((await ctx.http.get(`/v1/search/stores?${q(origin, '&sort=eta')}`).expect(200)).body.data)).toEqual(['Longe e Rápida', 'Perto e Lenta']);
    expect(names((await ctx.http.get(`/v1/search/stores?${q(origin, '&sort=distance')}`).expect(200)).body.data)).toEqual(['Perto e Lenta', 'Longe e Rápida']);
  });

  it('recálculo: mudar `entrega_min_por_km` no admin muda a faixa e pode tirar a loja do alcance', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Loja 6 km', at: await northOf(ctx, origin, 6000) });
    try {
      const before = (await home(origin)).nearbyStores[0].delivery.etaMinMinutes as number;
      await useParam(ctx, 'entrega_min_por_km', 8);
      await ctx.redis.flushdb();
      const after = (await home(origin)).nearbyStores[0].delivery.etaMinMinutes as number;
      expect(after).toBeGreaterThan(before);
      await useParam(ctx, 'entrega_min_por_km', 20); // 6 km x 1,3 x 20 = 156 min: acima do teto
      await ctx.redis.flushdb();
      expect((await home(origin)).nearbyStores).toEqual([]);
    } finally {
      await useParam(ctx, 'entrega_min_por_km', 6);
    }
  });

  it('página do produto, sacola e pedido trazem a faixa; fora do alcance a sacola bloqueia e o pedido é recusado', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    const product = (await ctx.http.get(`/v1/browse/products/${shop.store.productIds[0]}?${q(shop.origin)}`).expect(200)).body;
    expect(product.store.delivery).toMatchObject({ available: true, eta: { minMinutes: expect.any(Number), maxMinutes: expect.any(Number) } });
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const cart = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    expect(cart.delivery.eta).toMatchObject({ minMinutes: product.store.delivery.eta.minMinutes, maxMinutes: product.store.delivery.eta.maxMinutes });
    expect(cart.store).toMatchObject({ etaMinMinutes: cart.delivery.eta.minMinutes, etaMaxMinutes: cart.delivery.eta.maxMinutes });

    const created = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    expect(created.body.delivery.eta).toMatchObject({ minMinutes: cart.delivery.eta.minMinutes, maxMinutes: cart.delivery.eta.maxMinutes });
    const row = await orderRow(ctx, id);
    expect(row.etaFromAt && row.etaToAt).toBeTruthy();
    expect(row.etaMinMinutes).toBe(cart.delivery.eta.minMinutes);

    // O pagamento reancora a faixa (a espera do PIX não é atraso da loja).
    await approve(ctx, buyer.user, (await attemptOf(ctx, id)).id);
    const paid = await orderRow(ctx, id);
    expect(paid.etaFromAt!.getTime()).toBeGreaterThanOrEqual(row.etaFromAt!.getTime());
    expect(paid.etaToAt!.getTime() - paid.etaFromAt!.getTime()).toBe((row.etaMaxMinutes - row.etaMinMinutes) * 60_000);

    // Endereço fora do alcance (teto no menor valor que a validação do BUG-022 aceita, 60 min, e um endereço a ~7 km): a sacola bloqueia e o pedido não nasce.
    await useParam(ctx, 'entrega_max_min', 60);
    const far = await customerAt(ctx, { lat: shop.origin.lat + 0.06, lng: shop.origin.lng });
    try {
      await addToCart(ctx, far.user, shop.variants[0]!, 1).expect(200);
      const blocked = (await ctx.http.get(`/v1/cart?addressId=${far.addressId}`).set(bearer(far.user.accessToken)).expect(200)).body;
      expect(blocked.checkout.blockers).toContain('OUT_OF_RANGE');
      expect(blocked.delivery).toMatchObject({ available: false, eta: null });
      const { revision, totalCents } = await cartView(ctx, far.user, far.addressId);
      const refused = await ctx.http.post('/v1/orders').set(bearer(far.user.accessToken)).set('Idempotency-Key', crypto.randomUUID()).send({ mode: 'delivery', addressId: far.addressId, cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'card', card: { token: 'fake_tok_approved', installments: 1 } });
      expect(refused.status).toBeGreaterThanOrEqual(400);
    } finally {
      await useParam(ctx, 'entrega_max_min', 120);
    }
  });

  it('lojista edita o preparo; acima do que cabe no teto é recusado; null volta ao padrão', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 20 }]);
    const url = `/v1/stores/${shop.store.id}/delivery`;
    const ok = await ctx.http.put(url).set(bearer(shop.store.owner.accessToken)).send({ acceptsDelivery: true, prepMinutes: 35 });
    expect(ok.status, JSON.stringify(ok.body)).toBe(204);
    expect((await ctx.db.select().from(storeSettings).where(eq(storeSettings.storeId, shop.store.id)))[0]!.prepMinutes).toBe(35);
    const tooLong = await ctx.http.put(url).set(bearer(shop.store.owner.accessToken)).send({ acceptsDelivery: true, prepMinutes: 110 });
    expect(tooLong.status).toBe(422);
    await ctx.http.put(url).set(bearer(shop.store.owner.accessToken)).send({ acceptsDelivery: true, prepMinutes: null }).expect(204);
    expect((await ctx.db.select().from(storeSettings).where(eq(storeSettings.storeId, shop.store.id)))[0]!.prepMinutes).toBeNull();
  });

  describe('logística: atraso sobre a faixa e lote por área (E.2)', () => {
    async function readyDelivery() {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 20 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      const url = `/v1/stores/${shop.store.id}/orders/${created.id}`;
      await ctx.http.post(`${url}/accept`).set(bearer(shop.store.owner.accessToken)).expect(200);
      await ctx.http.post(`${url}/status`).set(bearer(shop.store.owner.accessToken)).send({ status: 'ready_for_collection' }).expect(200);
      const [delivery] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, created.id));
      return { orderId: created.id, delivery: delivery! };
    }

    it('a corrida herda o fim da faixa do pedido; passou dele aparece como atrasada e gera UM alerta (não o limite fixo de 60 min)', async () => {
      const ops = await createAdmin(ctx, 'operations');
      const r = await readyDelivery();
      const order = await orderRow(ctx, r.orderId);
      expect(r.delivery.etaToAt?.getTime()).toBe(order.etaToAt!.getTime());
      const list = async () => ((await ctx.http.get('/v1/admin/logistics/deliveries').query({ storeId: r.delivery.storeId, limit: '50' }).set(bearer(ops.accessToken)).expect(200)).body.data as { id: string; overdue: boolean; overdueMinutes: number | null }[]).find((d) => d.id === r.delivery.id)!;
      expect(await list()).toMatchObject({ overdue: false, overdueMinutes: null });
      const svc = ctx.app.get(DeliveriesService);
      const alertsOfRun = async () => (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'delivery_late'))).filter((a) => (a.details as { deliveryId?: string }).deliveryId === r.delivery.id);
      // Antes do fim da faixa: nenhum alerta para esta corrida (o banco é compartilhado com outras corridas).
      await svc.alertLateDue(new Date(order.etaToAt!.getTime() - 60_000));
      expect(await alertsOfRun()).toHaveLength(0);
      // Depois do fim: alerta uma única vez.
      await ctx.db.update(deliveries).set({ etaToAt: new Date(Date.now() - 10 * 60_000) }).where(eq(deliveries.id, r.delivery.id));
      expect(await list()).toMatchObject({ overdue: true });
      expect((await list()).overdueMinutes).toBeGreaterThanOrEqual(9);
      await svc.alertLateDue();
      expect(await alertsOfRun()).toHaveLength(1);
      await svc.alertLateDue();
      expect(await alertsOfRun()).toHaveLength(1); // idempotente
    });

    it('lote: 2 corridas prontas da mesma cidade saem com o mesmo motoboy; a fila mostra quantas há na área', async () => {
      const ops = await createAdmin(ctx, 'operations');
      const a = await readyDelivery();
      const b = await readyDelivery();
      const courier = (await ctx.http.post('/v1/admin/logistics/couriers').set(bearer(ops.accessToken)).send({ name: 'Moto Lote', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
      const queue = (await ctx.http.get('/v1/admin/logistics/deliveries').query({ storeId: a.delivery.storeId }).set(bearer(ops.accessToken)).expect(200)).body.data as { id: string; area: { key: string | null; readyCount: number } }[];
      expect(queue.find((d) => d.id === a.delivery.id)!.area.readyCount).toBeGreaterThanOrEqual(2);
      const res = await ctx.http.post('/v1/admin/logistics/deliveries/assign-batch').set(bearer(ops.accessToken)).send({ deliveryIds: [a.delivery.id, b.delivery.id], courierId: courier.id });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.assigned).toHaveLength(2);
      expect(res.body.failed).toEqual([]);
      const rows = await ctx.db.select().from(deliveries).where(eq(deliveries.courierId, courier.id));
      expect(rows).toHaveLength(2);
      // repetir: já atribuídas -> nada entra de novo
      const again = await ctx.http.post('/v1/admin/logistics/deliveries/assign-batch').set(bearer(ops.accessToken)).send({ deliveryIds: [a.delivery.id, b.delivery.id], courierId: courier.id });
      expect(again.status).toBe(422);
      // um só não é lote
      expect((await ctx.http.post('/v1/admin/logistics/deliveries/assign-batch').set(bearer(ops.accessToken)).send({ deliveryIds: [a.delivery.id, a.delivery.id], courierId: courier.id })).status).toBe(422);
    });
  });
});
