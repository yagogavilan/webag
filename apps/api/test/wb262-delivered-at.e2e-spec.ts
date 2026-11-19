import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { DeliveriesService } from '../src/modules/logistics/index.js';
import { auditLog, coupons, deliveries, orders } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { restoreFees } from './helpers/fees.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** WB-262 (DEC-064, HIP-P07): a operação informa a hora REAL da entrega (recuo até 60 min, motivo acima de 5 min, auditado). Banco real. */
describe('Hora real da entrega informada pela operação (WB-262)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let support: Awaited<ReturnType<typeof createAdmin>>;
  let cityId: string;
  const base = '/v1/admin/logistics';
  const minutesAgo = (min: number) => new Date(Date.now() - min * 60_000);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    cityId = (await ensureCity(ctx, 'Francisco Morato')).id;
    await restoreFees(ctx);
    ops = await createAdmin(ctx, 'operations');
    support = await createAdmin(ctx, 'support');
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });

  /** `delivery_events` é append-only (trigger): o teste recua a hora da saída desligando os gatilhos só nesta conexão. */
  async function backdateDeparture(deliveryId: string, minutes: number) {
    const client = await ctx.pool.connect();
    try {
      await client.query('set session_replication_role = replica');
      await client.query(`update delivery_events set created_at = $2 where delivery_id = $1 and to_status = 'out_for_delivery'`, [deliveryId, minutesAgo(minutes)]);
      await client.query('set session_replication_role = origin');
    } finally {
      client.release();
    }
  }
  const act = (id: string, body: Record<string, unknown>, who = ops) => ctx.http.post(`${base}/deliveries/${id}/status`).set(bearer(who.accessToken)).send(body);
  const courier = async () => (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: 'Moto Hora', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };

  /** Pedido real, pago, aceito, com a corrida SAIU para entrega; a saída é recuada em `departedMinutesAgo` (o evento é a referência da regra). */
  async function outForDelivery(departedMinutesAgo = 90) {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const url = `/v1/stores/${shop.store.id}/orders/${created.id}`;
    await ctx.http.post(`${url}/accept`).set(bearer(shop.store.owner.accessToken)).expect(200);
    await ctx.http.post(`${url}/status`).set(bearer(shop.store.owner.accessToken)).send({ status: 'ready_for_collection' }).expect(200);
    const [delivery] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, created.id));
    const m = await courier();
    await ctx.http.post(`${base}/deliveries/${delivery!.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: m.id }).expect(200);
    await act(delivery!.id, { action: 'confirm' }).expect(200);
    await act(delivery!.id, { action: 'picked_up' }).expect(200);
    await backdateDeparture(delivery!.id, departedMinutesAgo);
    const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, delivery!.id)))[0]!.deliveryCode!;
    return { shop, buyer, orderId: created.id, deliveryId: delivery!.id, code };
  }
  const couponsOf = (orderId: string) => ctx.db.select().from(coupons).where(eq(coupons.sourceOrderId, orderId));
  const deliveredRow = async (id: string) => (await ctx.db.select().from(deliveries).where(eq(deliveries.id, id)))[0]!;

  it('sem a hora informada vale a hora do clique, na corrida e no pedido', async () => {
    const r = await outForDelivery();
    const before = Date.now();
    const res = await act(r.deliveryId, { action: 'delivered', code: r.code }).expect(200);
    expect(Math.abs(Date.parse(res.body.deliveredAt) - before)).toBeLessThan(10_000);
    expect((await orderRow(ctx, r.orderId)).deliveredAt!.toISOString()).toBe(res.body.deliveredAt);
  });

  it('informada com recuo de até 5 min: vale, motivo opcional; vira a deliveredAt do pedido; histórico e auditoria guardam as duas horas', async () => {
    const r = await outForDelivery();
    const real = minutesAgo(4);
    const res = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: real.toISOString() }).expect(200);
    expect(res.body.deliveredAt).toBe(real.toISOString());
    expect((await orderRow(ctx, r.orderId)).deliveredAt!.toISOString()).toBe(real.toISOString());
    const detail = (await ctx.http.get(`${base}/deliveries/${r.deliveryId}`).set(bearer(ops.accessToken)).expect(200)).body;
    const event = detail.timeline.find((e: { action: string }) => e.action === 'delivered');
    expect(event).toMatchObject({ deliveredAt: real.toISOString() });
    expect(Math.abs(Date.parse(event.at) - Date.now())).toBeLessThan(15_000); // `at` = a hora do clique
    expect(typeof event.clickedAt).toBe('string');
    const [audit] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'delivery.delivered'), eq(auditLog.targetId, r.deliveryId)));
    expect(audit!.after).toMatchObject({ status: 'delivered', deliveredAt: real.toISOString() });
    expect(typeof (audit!.after as { clickedAt?: string }).clickedAt).toBe('string');
  });

  it('recuo acima de 5 min exige o motivo (400); com motivo vale; "outro" exige texto', async () => {
    const r = await outForDelivery();
    const real = minutesAgo(20).toISOString();
    const no = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: real });
    expect(no.status).toBe(400);
    expect(JSON.stringify(no.body)).toContain('deliveredAtReason');
    const other = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: real, deliveredAtReason: 'other' });
    expect(other.status).toBe(400);
    expect(JSON.stringify(other.body)).toContain('deliveredAtNote');
    expect((await deliveredRow(r.deliveryId)).status).toBe('out_for_delivery'); // nada mudou
    const ok = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: real, deliveredAtReason: 'courier_notified_late' }).expect(200);
    expect(ok.body.deliveredAt).toBe(real);
    const detail = (await ctx.http.get(`${base}/deliveries/${r.deliveryId}`).set(bearer(ops.accessToken)).expect(200)).body;
    expect(detail.timeline.find((e: { action: string }) => e.action === 'delivered')).toMatchObject({ deliveredAt: real, deliveredAtReason: 'courier_notified_late' });
  });

  it('fora da janela: 422 com o motivo e nada muda (futuro, mais de 60 min atrás, antes da saída)', async () => {
    const r = await outForDelivery(30); // saiu há 30 min
    const tryAt = async (at: Date) => act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: at.toISOString(), deliveredAtReason: 'no_signal' });
    const future = await tryAt(new Date(Date.now() + 10 * 60_000));
    expect(future.status).toBe(422);
    expect(future.body.code).toBe('DELIVERED_AT_IN_FUTURE');
    const beforeDeparture = await tryAt(minutesAgo(45));
    expect(beforeDeparture.status).toBe(422);
    expect(beforeDeparture.body.code).toBe('DELIVERED_AT_BEFORE_DEPARTURE');
    const old = await outForDelivery(180);
    const tooOld = await act(old.deliveryId, { action: 'delivered', code: old.code, deliveredAt: minutesAgo(61).toISOString(), deliveredAtReason: 'no_signal' });
    expect(tooOld.status).toBe(422);
    expect(tooOld.body.code).toBe('DELIVERED_AT_TOO_OLD');
    expect(tooOld.body.detail).toContain('60');
    for (const id of [r.deliveryId, old.deliveryId]) expect((await deliveredRow(id)).status).toBe('out_for_delivery');
    // o limite é inclusivo: 59 min atrás vale (a saída foi há 180)
    await act(old.deliveryId, { action: 'delivered', code: old.code, deliveredAt: minutesAgo(59).toISOString(), deliveredAtReason: 'no_signal' }).expect(200);
  });

  it('um relógio do navegador alguns segundos adiantado não é "futuro": vale a hora do clique', async () => {
    const r = await outForDelivery();
    const res = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: new Date(Date.now() + 30_000).toISOString() }).expect(200);
    expect(Date.parse(res.body.deliveredAt)).toBeLessThanOrEqual(Date.now());
  });

  it('só vale com `delivered` (400) e só para quem tem logistics:write (403)', async () => {
    const r = await outForDelivery();
    const wrong = await act(r.deliveryId, { action: 'not_delivered', failReason: 'customer_absent', deliveredAt: minutesAgo(2).toISOString() });
    expect(wrong.status).toBe(400);
    await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: minutesAgo(2).toISOString() }, support).expect(403);
    expect((await deliveredRow(r.deliveryId)).status).toBe('out_for_delivery');
  });

  it('C4: a compensação conta da hora real: entregue "no clique" 40 min depois do fim da faixa, mas a hora real foi dentro da tolerância = sem cupom; fora dela = cupom', async () => {
    const inTolerance = await outForDelivery();
    await ctx.db.update(orders).set({ etaToAt: minutesAgo(40) }).where(eq(orders.id, inTolerance.orderId));
    await act(inTolerance.deliveryId, { action: 'delivered', code: inTolerance.code, deliveredAt: minutesAgo(30).toISOString(), deliveredAtReason: 'courier_notified_late' }).expect(200); // 10 min depois do fim: dentro dos 15
    expect(await couponsOf(inTolerance.orderId)).toHaveLength(0);

    const outside = await outForDelivery();
    await ctx.db.update(orders).set({ etaToAt: minutesAgo(40) }).where(eq(orders.id, outside.orderId));
    await act(outside.deliveryId, { action: 'delivered', code: outside.code, deliveredAt: minutesAgo(10).toISOString(), deliveredAtReason: 'no_signal' }).expect(200); // 30 min depois do fim
    expect(await couponsOf(outside.orderId)).toHaveLength(1);

    // sem hora informada: vale o clique (40 min depois do fim) e gera o cupom (comportamento anterior preservado)
    const control = await outForDelivery();
    await ctx.db.update(orders).set({ etaToAt: minutesAgo(40) }).where(eq(orders.id, control.orderId));
    await act(control.deliveryId, { action: 'delivered', code: control.code }).expect(200);
    expect(await couponsOf(control.orderId)).toHaveLength(1);
  });

  it('C5: o relatório de logística mede o prazo pela hora real, não pela do clique', async () => {
    const svc = ctx.app.get(DeliveriesService);
    const sys = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
    const storeId = randomUUID();
    const make = async (realMinutesAfterReady: number | null) => {
      const { delivery } = await ctx.db.transaction((tx) =>
        svc.createInTx(tx, { orderId: randomUUID(), storeId, cityId, feeCents: 800, expectedCostCents: 900, volumes: 1, contact: { number: 'WB-AAAAA', kind: 'delivery', storeName: 'Loja', storePhone: null, pickupAddress: 'Rua A, 1', dropoffAddress: 'Rua B, 2', customerFirstName: 'Ana', customerPhone: '11 97777-0000', volumes: 1, note: null } }, sys),
      );
      await ctx.db.update(deliveries).set({ readyAt: minutesAgo(100) }).where(eq(deliveries.id, delivery.id)); // pronta há 100 min
      const m = await courier();
      const assigned = await ctx.http.post(`${base}/deliveries/${delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: m.id, addressConfirmed: true });
      expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
      for (const action of ['confirm', 'picked_up']) await act(delivery.id, { action }).expect(200);
      await backdateDeparture(delivery.id, 95);
      const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, delivery.id)))[0]!.deliveryCode;
      const at = realMinutesAfterReady === null ? {} : { deliveredAt: minutesAgo(100 - realMinutesAfterReady).toISOString(), deliveredAtReason: 'no_signal' };
      await act(delivery.id, { action: 'delivered', ...(code ? { code } : {}), ...at }).expect(200);
      return delivery.id;
    };
    // pelo clique levaria ~100 min (fora do limite de 60); pela hora real (a 50 min do pronto) está no prazo
    await make(50);
    const day = new Date(minutesAgo(100).getTime() - 3 * 3_600_000).toISOString().slice(0, 10); // dia civil de Brasília da hora do pronto
    const report = (await ctx.http.get(`${base}/reports/summary?from=${day}&to=${day}&storeId=${storeId}`).set(bearer(ops.accessToken)).expect(200)).body;
    expect(report.totals.delivered).toBe(1);
    expect(report.totals.avgMinutes.readyToDelivered).toBeGreaterThan(49);
    expect(report.totals.avgMinutes.readyToDelivered).toBeLessThan(51);
    expect(report.totals.onTime).toBe(1);
  });
});
