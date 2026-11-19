import { eq } from 'drizzle-orm';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { orderCancelRequests, orders, paymentAlerts, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** BUG-015 / WB-028 C2: "Pedir cancelamento" com o pedido em separação: a loja decide; sem resposta o admin é alertado. */
describe('Pedir cancelamento em separação (BUG-015)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  async function inPreparation() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    const attempt = await attemptOf(ctx, created.id);
    await approve(ctx, buyer.user, attempt.id);
    const url = `/v1/stores/${shop.store.id}/orders/${created.id}`;
    const owner = bearer(shop.store.owner.accessToken);
    await ctx.http.post(`${url}/accept`).set(owner).expect(200);
    await ctx.http.post(`${url}/status`).set(owner).send({ status: 'in_preparation' }).expect(200);
    return { shop, buyer, orderId: created.id, attempt, url, owner };
  }
  const customerView = async (r: { buyer: { user: { accessToken: string } }; orderId: string }) => (await ctx.http.get(`/v1/orders/${r.orderId}`).set(bearer(r.buyer.user.accessToken)).expect(200)).body;

  it('só vale em separação (antes disso o cliente cancela direto); é idempotente e o app vê o andamento', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const early = await ctx.http.post(`/v1/orders/${created.id}/cancel-request`).set(bearer(buyer.user.accessToken)).send({});
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('ORDER_NOT_CANCELLABLE');

    const r = await inPreparation();
    expect((await customerView(r)).allowedActions).toContain('request_cancel');
    const first = await ctx.http.post(`/v1/orders/${r.orderId}/cancel-request`).set(bearer(r.buyer.user.accessToken)).send({ reason: 'mudei de ideia' });
    expect(first.status, JSON.stringify(first.body)).toBe(202);
    expect(first.body).toMatchObject({ status: 'pending', reason: 'mudei de ideia', decidedAt: null });
    expect(new Date(first.body.respondBy).getTime() - new Date(first.body.requestedAt).getTime()).toBe(10 * 60_000);
    const again = await ctx.http.post(`/v1/orders/${r.orderId}/cancel-request`).set(bearer(r.buyer.user.accessToken)).send({}).expect(202);
    expect(again.body.id).toBe(first.body.id); // toque duplo: uma só solicitação
    const view = await customerView(r);
    expect(view.cancelRequest).toMatchObject({ status: 'pending' });
    expect(view.allowedActions).not.toContain('request_cancel');
    expect(view.status).toBe('in_preparation'); // o pedido segue até a loja decidir
    // outra conta não enxerga o pedido
    const stranger = await customerAt(ctx, r.shop.origin);
    await ctx.http.post(`/v1/orders/${r.orderId}/cancel-request`).set(bearer(stranger.user.accessToken)).send({}).expect(404);
  });

  it('a loja aprova: pedido cancelado (ator loja), estoque devolvido e estorno total; decidir de novo é idempotente', async () => {
    const r = await inPreparation();
    await ctx.http.post(`/v1/orders/${r.orderId}/cancel-request`).set(bearer(r.buyer.user.accessToken)).send({ reason: 'comprei por engano' }).expect(202);
    const store = await ctx.http.get(r.url).set(r.owner).expect(200);
    expect(store.body.cancelRequest).toMatchObject({ status: 'pending', reason: 'comprei por engano' });
    const done = await ctx.http.post(`${r.url}/cancel-request/accept`).set(r.owner).expect(200);
    expect(done.body.status).toBe('cancelled');
    const row = await orderRow(ctx, r.orderId);
    expect(row).toMatchObject({ status: 'cancelled', cancelledBy: 'store' });
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id));
    expect(refunds.reduce((sum, x) => sum + x.amountCents, 0)).toBe(r.attempt.amountCents);
    await ctx.http.post(`${r.url}/cancel-request/accept`).set(r.owner).expect(200); // repetir
    expect((await customerView(r)).cancelRequest).toMatchObject({ status: 'approved', decidedBy: 'store' });
  });

  it('a loja recusa com motivo: o pedido segue, o cliente vê a resposta e pode pedir de novo', async () => {
    const r = await inPreparation();
    await ctx.http.post(`/v1/orders/${r.orderId}/cancel-request`).set(bearer(r.buyer.user.accessToken)).send({}).expect(202);
    await ctx.http.post(`${r.url}/cancel-request/decline`).set(r.owner).send({ reason: 'x' }).expect(400);
    await ctx.http.post(`${r.url}/cancel-request/decline`).set(r.owner).send({ reason: 'Já está embalado' }).expect(200);
    const view = await customerView(r);
    expect(view.status).toBe('in_preparation');
    expect(view.cancelRequest).toMatchObject({ status: 'refused', decisionNote: 'Já está embalado' });
    expect(view.allowedActions).toContain('request_cancel');
    await ctx.http.post(`${r.url}/cancel-request/accept`).set(r.owner).expect(409); // sem pedido pendente
    // outra loja não decide
    const other = await shopWith(ctx, [{ name: 'Outra', priceCents: 1_000, stock: 2 }]);
    await ctx.http.post(`/v1/stores/${other.store.id}/orders/${r.orderId}/cancel-request/decline`).set(bearer(other.store.owner.accessToken)).send({ reason: 'não é minha' }).expect(404);
  });

  it('sem resposta da loja no prazo, o admin é alertado (uma vez) e pode decidir cancelando', async () => {
    const r = await inPreparation();
    await ctx.http.post(`/v1/orders/${r.orderId}/cancel-request`).set(bearer(r.buyer.user.accessToken)).send({}).expect(202);
    const alertsOf = async () => (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'cancel_request_unanswered'))).filter((a) => (a.details as { orderId?: string }).orderId === r.orderId);
    const sweeper = ctx.app.get(OrdersService);
    await sweeper.sweep(new Date(Date.now() + 5 * 60_000));
    expect(await alertsOf()).toHaveLength(0); // ainda dentro dos 10 min
    await ctx.db.update(orderCancelRequests).set({ requestedAt: new Date(Date.now() - 11 * 60_000) }).where(eq(orderCancelRequests.orderId, r.orderId));
    await sweeper.sweep();
    await sweeper.sweep();
    expect(await alertsOf()).toHaveLength(1);
    expect((await ctx.db.select().from(orders).where(eq(orders.id, r.orderId)))[0]!.status).toBe('in_preparation');
  });
});
