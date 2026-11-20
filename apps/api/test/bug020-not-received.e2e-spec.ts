import { eq, sql } from 'drizzle-orm';
import { vi } from 'vitest';
import { DeliveriesService } from '../src/modules/logistics/index.js';
import { OrderEventBus, type OrderEvent } from '../src/modules/orders/order-events.bus.js';
import { deliveries, paymentAlerts } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';

/** L.4 e L.5 (DEC-036): o pedido de entrega passa pela logística da Webag; aviso ao admin e ao cliente; devolução à loja. */
describe('BUG-020: "não recebi" x auto-conclusão de 24 h (RN-07)', () => {
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

  async function outForDelivery() {
    const r = await readyOrder();
    const m = await courier();
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: m.id }).expect(200);
    await act(r.delivery.id, { action: 'confirm' }).expect(200);
    await act(r.delivery.id, { action: 'picked_up' }).expect(200);
    return r;
  }
  const later = () => new Date(Date.now() + 25 * 3_600_000); // o histórico é append-only: avança o relógio, não recua o banco
  /** A varredura lê no máximo 100 corridas por vez e o banco é compartilhado com outros arquivos: repete até esvaziar (sem depender da ordem dos arquivos). */
  const sweepAll = async (svc: DeliveriesService): Promise<number> => {
    let total = 0;
    for (let i = 0; i < 20; i += 1) {
      const n = await svc.autoConcludeDue(later());
      total += n;
      if (n < 100) break;
    }
    return total;
  };

  it('RN-07: corrida em saiu-para-entrega há > 24 h NÃO vira entregue se o cliente já avisou "não recebi"; a operação é alertada', async () => {
    const r = await outForDelivery();
    await ctx.http.post(`/v1/orders/${r.orderId}/not-received`).set(bearer(r.buyer.user.accessToken)).send({}).expect(202);
    const svc = ctx.app.get(DeliveriesService);
    await sweepAll(svc);
    await sweepAll(svc); // repetir não duplica o alerta
    const status = (await orderRow(ctx, r.orderId)).status;
    expect(status, `pedido ${status} depois da auto-conclusão com "não recebi" registrado`).not.toBe('delivered');
    const [delivery] = await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id));
    expect(delivery!.status).toBe('out_for_delivery');
    const alerts = await ctx.db.select().from(paymentAlerts).where(sql`${paymentAlerts.kind} = 'delivery_auto_conclude_held' and ${paymentAlerts.details}->>'deliveryId' = ${r.delivery.id}`);
    expect(alerts).toHaveLength(1);
    // A operação conclui na mão (decisão humana) (o aviso não trava a decisão humana).
    await act(r.delivery.id, { action: 'not_delivered', failReason: 'customer_absent' }).expect(200);
  });

  it('controle: sem aviso do cliente a auto-conclusão de 24 h segue funcionando', async () => {
    const r = await outForDelivery();
    const concluded = await sweepAll(ctx.app.get(DeliveriesService));
    expect(concluded).toBeGreaterThanOrEqual(1);
    expect((await orderRow(ctx, r.orderId)).status).toBe('delivered');
  });
});
