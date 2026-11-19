import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { auditLog, deliveries, orderItems, orders, paymentRefundIntents, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** Q.1 / BUG-011 / SEC-151: o admin cancela o pedido e o estorno total manual também o cancela (estado, estoque, corrida, auditoria). */
describe('Admin cancela o pedido (BUG-011)', () => {
  let ctx: TestContext;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;
  let finance: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    superAdmin = await createAdmin(ctx, 'super_admin');
    finance = await createAdmin(ctx, 'finance');
  });
  afterAll(() => ctx.close());

  async function paidOrder() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 2).expect(200);
    const res = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const orderId = res.body.id as string;
    const attempt = await attemptOf(ctx, orderId);
    await approve(ctx, buyer.user, attempt.id);
    return { shop, buyer, orderId, attempt, url: `/v1/stores/${shop.store.id}/orders/${orderId}`, owner: shop.store.owner.accessToken };
  }
  const stockOf = async (variantId: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, variantId)))[0]!.stock;
  const refunded = async (attemptId: string) => (await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, attemptId))).reduce((s, r) => s + r.amountCents, 0);
  const cancel = (token: string, orderId: string, body: Record<string, unknown> = { reason: 'cancelamento pelo admin em teste' }) => ctx.http.post(`/v1/admin/orders/${orderId}/cancel`).set(bearer(token)).send(body);

  it('cancelar: pedido cancelado pelo admin, estoque devolvido, estorno total, auditoria e a loja não aceita mais; repetir é idempotente', async () => {
    const o = await paidOrder();
    expect(await stockOf(o.shop.variants[0]!)).toBe(8);
    const res = await cancel(superAdmin.accessToken, o.orderId).expect(200);
    expect(res.body).toMatchObject({ status: 'cancelled', refunded: { amount: o.attempt.amountCents }, remaining: { amount: 0 } });
    const row = await orderRow(ctx, o.orderId);
    expect(row).toMatchObject({ status: 'cancelled', cancelledBy: 'admin' });
    expect(await stockOf(o.shop.variants[0]!)).toBe(10);
    expect(await refunded(o.attempt.id)).toBe(o.attempt.amountCents);
    const audits = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, o.orderId), eq(auditLog.action, 'order.admin_cancel')));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: superAdmin.userId, reason: 'cancelamento pelo admin em teste' });
    expect((await ctx.http.post(`${o.url}/accept`).set(bearer(o.owner)).send({})).status).toBeGreaterThanOrEqual(409);
    await cancel(superAdmin.accessToken, o.orderId).expect(200); // repetição
    expect(await refunded(o.attempt.id)).toBe(o.attempt.amountCents);
    expect((await orderRow(ctx, o.orderId)).status).toBe('cancelled');
  });

  it('cancelar sem estornar (refund=false) deixa o dinheiro para o financeiro; motivo curto é 400; pedido de outro estado terminal é 409', async () => {
    const o = await paidOrder();
    await cancel(superAdmin.accessToken, o.orderId, { reason: 'curto' }).expect(400);
    const res = await cancel(superAdmin.accessToken, o.orderId, { reason: 'cancelar sem estorno, teste', refund: false }).expect(200);
    expect(res.body.refunded.amount).toBe(0);
    expect(await refunded(o.attempt.id)).toBe(0);
    expect((await orderRow(ctx, o.orderId)).status).toBe('cancelled');

    const delivered = await paidOrder();
    await ctx.http.post(`${delivered.url}/accept`).set(bearer(delivered.owner)).send({}).expect(200);
    await ctx.db.update(orders).set({ status: 'delivered' }).where(eq(orders.id, delivered.orderId));
    await cancel(superAdmin.accessToken, delivered.orderId).expect(409);
    await cancel(superAdmin.accessToken, randomUUID()).expect(404);
  });

  it('pedido com corrida em aberto: o cancelamento do admin cancela a corrida', async () => {
    const o = await paidOrder();
    await ctx.http.post(`${o.url}/accept`).set(bearer(o.owner)).send({}).expect(200);
    await ctx.http.post(`${o.url}/status`).set(bearer(o.owner)).send({ status: 'ready_for_collection' }).expect(200);
    await cancel(superAdmin.accessToken, o.orderId).expect(200);
    const [d] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, o.orderId));
    expect(d!.status).toBe('cancelled');
    expect((await orderRow(ctx, o.orderId)).status).toBe('cancelled');
  });

  it('estorno total manual cancela o pedido, devolve o estoque e a corrida; estorno parcial não cancela', async () => {
    const o = await paidOrder();
    await ctx.http.post(`${o.url}/accept`).set(bearer(o.owner)).send({}).expect(200);
    await ctx.http.post(`${o.url}/status`).set(bearer(o.owner)).send({ status: 'ready_for_collection' }).expect(200);
    const partial = await ctx.http.post(`/v1/admin/orders/${o.orderId}/refunds`).set(bearer(superAdmin.accessToken)).set('Idempotency-Key', randomUUID()).send({ amountCents: 1_000, reason: 'estorno parcial para teste' }).expect(200);
    expect(partial.body.status).toBe('done');
    expect((await orderRow(ctx, o.orderId)).status).toBe('ready_for_collection');
    await ctx.http.post(`/v1/admin/orders/${o.orderId}/refunds`).set(bearer(superAdmin.accessToken)).set('Idempotency-Key', randomUUID()).send({ amountCents: o.attempt.amountCents - 1_000, reason: 'estorno do restante, teste' }).expect(200);
    expect(await orderRow(ctx, o.orderId)).toMatchObject({ status: 'cancelled', cancelledBy: 'admin' });
    expect(await stockOf(o.shop.variants[0]!)).toBe(10);
    const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, o.orderId));
    expect(items.every((i) => i.stockState === 'released')).toBe(true);
    const [d] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, o.orderId));
    expect(d!.status).toBe('cancelled');
    expect(await refunded(o.attempt.id)).toBe(o.attempt.amountCents); // sem estorno dobrado
    const audits = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, o.orderId), eq(auditLog.action, 'order.cancel_by_full_refund')));
    expect(audits).toHaveLength(1);
  });

  it('SEC-142: o financeiro não contorna o teto cancelando o pedido; o super admin pode', async () => {
    const o = await paidOrder(); // o teto do financeiro cai para abaixo do total do pedido
    await ctx.http.put('/v1/admin/parameters/estorno_super_admin_cents').set(bearer(superAdmin.accessToken)).send({ value: 1_000, reason: 'teste do limite do financeiro' }).expect(200);
    try {
      const res = await cancel(finance.accessToken, o.orderId);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SUPER_ADMIN_REQUIRED');
      expect((await orderRow(ctx, o.orderId)).status).toBe('received'); // a transação inteira foi desfeita
      await cancel(superAdmin.accessToken, o.orderId).expect(200);
    } finally {
      await ctx.http.put('/v1/admin/parameters/estorno_super_admin_cents').set(bearer(superAdmin.accessToken)).send({ value: 50_000, reason: 'restaura o limite do financeiro' }).expect(200);
    }
  });
});
