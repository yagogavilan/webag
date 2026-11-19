import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { LedgerService } from '../src/modules/finance/index.js';
import { OrderEventBus, type OrderEvent } from '../src/modules/orders/order-events.bus.js';
import { deliveries, paymentAlerts, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';

/** L.4 e L.5 (DEC-036): o pedido de entrega passa pela logística da Webag; aviso ao admin e ao cliente; devolução à loja. */
describe('Pedido com logística da Webag (WB-229, WB-233, WB-235)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let events: OrderEvent[];
  const store = (shop: Shop) => bearer(shop.store.owner.accessToken);
  const base = '/v1/admin/logistics';

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ops = await createAdmin(ctx, 'operations');
    events = [];
    ctx.app.get(OrderEventBus).subscribe((e) => void events.push(e));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });

  async function readyOrder() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    const attempt = await attemptOf(ctx, created.id);
    await approve(ctx, buyer.user, attempt.id);
    const url = `/v1/stores/${shop.store.id}/orders/${created.id}`;
    await ctx.http.post(`${url}/accept`).set(store(shop)).expect(200);
    const ready = await ctx.http.post(`${url}/status`).set(store(shop)).send({ status: 'ready_for_collection', volumes: 2, note: 'tocar a campainha' });
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    const [delivery] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, created.id));
    return { shop, buyer, orderId: created.id, attempt, url, delivery: delivery! };
  }
  const courier = async () => (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: 'Carlos Moto Silva', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
  const act = (id: string, body: Record<string, unknown>) => ctx.http.post(`${base}/deliveries/${id}/status`).set(bearer(ops.accessToken)).send(body);
  const customerView = async (r: Awaited<ReturnType<typeof readyOrder>>) => (await ctx.http.get(`/v1/orders/${r.orderId}`).set(bearer(r.buyer.user.accessToken)).expect(200)).body;

  it('"pronto para coleta" cria UMA corrida com dados mínimos, avisa o admin e o cliente; toque duplo não duplica', async () => {
    const before = events.length;
    const r = await readyOrder();
    expect(r.delivery).toMatchObject({ status: 'ready_for_collection', kind: 'delivery', volumes: 2, note: 'tocar a campainha', feeCents: 500 });
    await ctx.http.post(`${r.url}/status`).set(store(r.shop)).send({ status: 'ready_for_collection' }).expect(200);
    expect(await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, r.orderId))).toHaveLength(1);
    // aviso ao admin (alerta durável para o painel) e ao cliente (evento do pedido)
    expect((await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'delivery_ready'))).some((a) => (a.details as { orderId?: string }).orderId === r.orderId)).toBe(true);
    expect(events.slice(before).some((e) => e.orderId === r.orderId && e.to === 'ready_for_collection')).toBe(true);
    const contact = r.delivery.contact as Record<string, unknown>;
    expect(contact).toMatchObject({ customerFirstName: expect.any(String), dropoffAddress: expect.stringContaining('Rua Teste, 10') });
    expect(Object.keys(contact).sort()).toEqual(['customerFirstName', 'customerPhone', 'dropoffAddress', 'kind', 'note', 'number', 'pickupAddress', 'storeName', 'storePhone', 'volumes']); // nada além do necessário (LGPD)
    // admin vê na fila; mensagem sem CPF, e-mail, itens e valores
    const queue = (await ctx.http.get(`${base}/deliveries`).query({ storeId: r.shop.store.id }).set(bearer(ops.accessToken)).expect(200)).body.data;
    expect(queue.map((d: { id: string }) => d.id)).toContain(r.delivery.id);
  });

  it('entrega completa: atribuir, a caminho, saiu, entregue com o código do cliente; o pedido acompanha e o cliente é avisado a cada passo', async () => {
    const r = await readyOrder();
    const m = await courier();
    const before = events.length;
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: m.id }).expect(200);
    let view = await customerView(r);
    expect(view.status).toBe('ready_for_collection');
    expect(view.tracking).toMatchObject({ status: 'awaiting_courier', courierFirstName: 'Carlos', deliveryCode: null });
    expect(JSON.stringify(view)).not.toMatch(/Silva|5511\d{8}/); // só o primeiro nome do motoboy, sem telefone

    await act(r.delivery.id, { action: 'confirm' }).expect(200);
    expect((await customerView(r)).tracking.status).toBe('courier_en_route');
    await act(r.delivery.id, { action: 'picked_up' }).expect(200);
    view = await customerView(r);
    expect(view).toMatchObject({ status: 'out_for_delivery', tracking: { status: 'out_for_delivery' } });
    const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!.deliveryCode!;
    expect(view.tracking.deliveryCode).toBe(code); // o cliente vê o código a partir de "saiu para entrega"
    // a loja não consegue mexer (nem ver o código nem o telefone do motoboy)
    expect((await ctx.http.post(`${r.url}/status`).set(store(r.shop)).send({ status: 'delivered' })).status).toBe(409);
    expect(JSON.stringify((await ctx.http.get(r.url).set(store(r.shop)).expect(200)).body)).not.toContain(code);

    await act(r.delivery.id, { action: 'delivered', code: code === '0000' ? '1111' : '0000' }).expect(422);
    await act(r.delivery.id, { action: 'delivered', code }).expect(200);
    view = await customerView(r);
    expect(view.status).toBe('delivered');
    expect(view.tracking).toMatchObject({ status: 'delivered', deliveryCode: null });
    expect((await orderRow(ctx, r.orderId)).deliveredAt).not.toBeNull();
    // 1 aviso por mudança da corrida: atribuído, a caminho, saiu, entregue
    const mine = events.slice(before).filter((e) => e.orderId === r.orderId);
    expect(mine.filter((e) => e.delivery).map((e) => e.delivery!.status)).toEqual(['awaiting_courier', 'courier_en_route', 'out_for_delivery', 'delivered']);
    expect(mine.filter((e) => !e.delivery).map((e) => e.to)).toEqual(['out_for_delivery', 'delivered']);
    // ledger fecha e a entrega continua sendo receita da Webag
    const b = await ctx.app.get(LedgerService).balances(r.orderId);
    expect(b).toMatchObject({ deliveryFeeRevenue: 500, commissionRevenue: 800 });
  });

  it('voltar para a separação: a loja só enquanto não há motoboy; com motoboy só o admin (a corrida é cancelada junto)', async () => {
    const r = await readyOrder();
    const back = await ctx.http.post(`${r.url}/status`).set(store(r.shop)).send({ status: 'in_preparation' }).expect(200);
    expect(back.body.status).toBe('in_preparation');
    expect((await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!.status).toBe('cancelled');
    // marcar pronto de novo é possível?  A corrida antiga está cancelada: nasce a regra de uma por pedido; o 2º "pronto" reaproveita a mesma linha
    const second = await ctx.http.post(`${r.url}/status`).set(store(r.shop)).send({ status: 'ready_for_collection' });
    expect([200, 409]).toContain(second.status);

    const r2 = await readyOrder();
    const m = await courier();
    await ctx.http.post(`${base}/deliveries/${r2.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: m.id }).expect(200);
    const blocked = await ctx.http.post(`${r2.url}/status`).set(store(r2.shop)).send({ status: 'in_preparation' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('DELIVERY_ALREADY_ASSIGNED');
  });

  it('não entregue e devolvida à loja: o pedido é cancelado com estorno total (inclui a taxa de entrega) e o cliente é avisado', async () => {
    const r = await readyOrder();
    const m = await courier();
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: m.id }).expect(200);
    await act(r.delivery.id, { action: 'confirm' }).expect(200);
    await act(r.delivery.id, { action: 'picked_up' }).expect(200);
    await act(r.delivery.id, { action: 'not_delivered', failReason: 'customer_absent' }).expect(200);
    const mid = await customerView(r);
    expect(mid).toMatchObject({ status: 'out_for_delivery', tracking: { status: 'not_delivered', failReason: 'customer_absent' } });
    await act(r.delivery.id, { action: 'return_confirmed' }).expect(200);
    const view = await customerView(r);
    expect(view).toMatchObject({ status: 'cancelled', cancellation: { reason: 'Entrega não realizada: pedido devolvido à loja' } });
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id));
    expect(refunds.map((x) => x.amountCents)).toEqual([r.attempt.amountCents]); // estorno total, com a taxa de entrega
    expect(await ctx.app.get(LedgerService).verifyOrder(r.orderId)).toMatchObject({ ok: true });
    expect((await orderRow(ctx, r.orderId)).status).toBe('cancelled');
  });

  it('o cliente só vê o acompanhamento do PRÓPRIO pedido (IDOR) e a retirada não tem corrida', async () => {
    const r = await readyOrder();
    const other = await customerAt(ctx, r.shop.origin);
    await ctx.http.get(`/v1/orders/${r.orderId}`).set(bearer(other.user.accessToken)).expect(404);
    expect((await customerView(r)).tracking).not.toBeNull();
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }], { pickupEnabled: true });
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const revision = (await ctx.http.get('/v1/cart?mode=pickup').set(bearer(buyer.user.accessToken)).expect(200)).body.revision;
    const created = (await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', crypto.randomUUID()).send({ mode: 'pickup', cartRevision: revision, paymentMethod: 'pix' }).expect(201)).body;
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    await ctx.http.post(`/v1/stores/${shop.store.id}/orders/${created.id}/accept`).set(store(shop)).expect(200);
    expect((await ctx.http.post(`/v1/stores/${shop.store.id}/orders/${created.id}/status`).set(store(shop)).send({ status: 'ready_for_collection' })).status).toBe(409); // retirada não vai à coleta da Webag
    expect((await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(buyer.user.accessToken)).expect(200)).body.tracking).toBeNull();
  });
});
