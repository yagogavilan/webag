import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { AuditService } from '../src/modules/admin/index.js';
import { InventoryService } from '../src/modules/catalog/index.js';
import { deliveries } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/**
 * R.5 / I7: ordem global de locks PEDIDO -> TROCA -> CORRIDA (ADR-011). Admin cancelando o pedido no mesmo instante em que a
 * operação marca "entregue" era deadlock (40P01 = 500). Os atrasos injetados abrem a janela que antes derrubava uma das duas.
 */
describe('Ordem de locks pedido -> corrida sem deadlock (I7)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ops = await createAdmin(ctx, 'operations');
    superAdmin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(() => ctx.close());
  afterEach(() => vi.restoreAllMocks());

  async function outForDelivery() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const res = await placeOrder(ctx, buyer.user, buyer.addressId);
    const orderId = res.body.id as string;
    await approve(ctx, buyer.user, (await attemptOf(ctx, orderId)).id);
    const url = `/v1/stores/${shop.store.id}/orders/${orderId}`;
    await ctx.http.post(`${url}/accept`).set(bearer(shop.store.owner.accessToken)).send({}).expect(200);
    await ctx.http.post(`${url}/status`).set(bearer(shop.store.owner.accessToken)).send({ status: 'ready_for_collection' }).expect(200);
    const [d] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
    const courier = (await ctx.http.post('/v1/admin/logistics/couriers').set(bearer(ops.accessToken)).send({ name: 'Carlos Moto Silva', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
    await ctx.http.post(`/v1/admin/logistics/deliveries/${d!.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: courier.id }).expect(200);
    for (const action of ['confirm', 'picked_up']) await ctx.http.post(`/v1/admin/logistics/deliveries/${d!.id}/status`).set(bearer(ops.accessToken)).send({ action }).expect(200);
    expect((await orderRow(ctx, orderId)).status).toBe('out_for_delivery');
    return { orderId, deliveryId: d!.id };
  }

  it('admin cancela o pedido e a operação marca entregue ao mesmo tempo: nenhuma das duas termina em 500 e o estado final é coerente', async () => {
    // Janelas abertas de propósito: a corrida segura o lock enquanto a auditoria demora; o cancelamento segura o pedido enquanto o estoque demora.
    const realAudit = AuditService.prototype.record;
    vi.spyOn(AuditService.prototype, 'record').mockImplementation(async function (this: AuditService, ...args: Parameters<AuditService['record']>) {
      if (args[2].action.startsWith('delivery.')) await sleep(400);
      return realAudit.apply(this, args);
    });
    const realRestock = InventoryService.prototype.restock;
    vi.spyOn(InventoryService.prototype, 'restock').mockImplementation(async function (this: InventoryService, ...args: Parameters<InventoryService['restock']>) {
      await sleep(250);
      return realRestock.apply(this, args);
    });
    for (let i = 0; i < 3; i += 1) {
      const o = await outForDelivery();
      const [cancel, delivered] = await Promise.all([
        ctx.http.post(`/v1/admin/orders/${o.orderId}/cancel`).set(bearer(superAdmin.accessToken)).send({ reason: 'cancelamento concorrente, teste de lock' }),
        ctx.http.post(`/v1/admin/logistics/deliveries/${o.deliveryId}/status`).set(bearer(superAdmin.accessToken)).send({ action: 'delivered', overrideReason: 'concluir sem código, teste de lock' }),
      ]);
      expect([200, 409]).toContain(cancel.status);
      expect([200, 409]).toContain(delivered.status);
      expect([cancel.status, delivered.status].filter((s) => s >= 500), `cancel ${cancel.status} ${JSON.stringify(cancel.body)} / delivered ${delivered.status} ${JSON.stringify(delivered.body)}`).toHaveLength(0);
      const status = (await orderRow(ctx, o.orderId)).status;
      expect(['cancelled', 'delivered']).toContain(status);
      const [d] = await ctx.db.select().from(deliveries).where(eq(deliveries.id, o.deliveryId));
      expect(d!.status).toBe(status === 'cancelled' ? 'cancelled' : 'delivered');
    }
  }, 60_000);
});
