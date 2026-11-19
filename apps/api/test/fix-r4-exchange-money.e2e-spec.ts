import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/index.js';
import { orderItems, orders, paymentAttempts, paymentRefunds, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, makeCoupon, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';

/** R.4: troca com frete grátis (I4), líquido da loja em uma só definição (I6) e diferença de preço da troca com split (I12, DEC-047). */
describe('Troca e financeiro da loja: dinheiro (R.4, I4, I6, I12)', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  const brt = (offsetDays: number) => new Date(Date.now() - 3 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
  const range = `from=${brt(-2)}&to=${brt(1)}`;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ledger = ctx.app.get(LedgerService);
  });
  afterAll(() => ctx.close());

  async function deliveredOrder(opts: { couponKind?: 'free_shipping' } = {}) {
    const shop: Shop = await shopWith(ctx, [
      { name: 'Camiseta', priceCents: 8_000, stock: 20 },
      { name: 'Bermuda', priceCents: 8_000, stock: 20 },
    ]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    await addToCart(ctx, buyer.user, shop.variants[1]!, 1).expect(200);
    if (opts.couponKind) {
      const coupon = await makeCoupon(ctx, { kind: 'free_shipping', scope: 'platform', value: 0 });
      await ctx.http.put('/v1/cart/coupon').set(bearer(buyer.user.accessToken)).send({ code: coupon.code }).expect(200);
    }
    const created = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = created.body.id as string;
    await approve(ctx, buyer.user, (await attemptOf(ctx, orderId)).id);
    const order = await orderRow(ctx, orderId);
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7, deliverySnapshot: { ...(order.deliverySnapshot ?? {}), exchangeFeeCents: 900, expectedCostCents: 700 } }).where(eq(orders.id, orderId));
    const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    return { shop, buyer, orderId, items, itemA: items.find((i) => i.variantId === shop.variants[0])!, itemB: items.find((i) => i.variantId === shop.variants[1])! };
  }
  type Delivered = Awaited<ReturnType<typeof deliveredOrder>>;
  const request = (d: Delivered, body: Record<string, unknown>) => ctx.http.post(`/v1/orders/${d.orderId}/exchanges`).set(bearer(d.buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send(body);
  const owner = (d: Delivered) => bearer(d.shop.store.owner.accessToken);
  const refundsOf = async (orderId: string) => {
    const attempt = await attemptOf(ctx, orderId);
    return (await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).map((r) => r.amountCents).sort((a, b) => a - b);
  };
  async function dropAtStoreWithdrawal(d: Delivered, item: { id: string }) {
    const r = await request(d, { orderItemId: item.id, type: 'withdrawal', method: 'drop_at_store' }).expect(201);
    const code = (await ctx.http.get(`/v1/exchanges/${r.body.id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body.storeCode as string;
    await ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${r.body.id}/receive`).set(owner(d)).send({ ok: true, code }).expect(200);
  }

  it('I4: cupom de frete grátis não reduz o item devolvido nem devolve frete que o cliente não pagou', async () => {
    const d = await deliveredOrder({ couponKind: 'free_shipping' });
    const order = await orderRow(ctx, d.orderId);
    expect(order.deliveryFeeCents).toBeGreaterThan(0);
    expect(order.discountCents).toBe(order.deliveryFeeCents); // o desconto é o frete
    await dropAtStoreWithdrawal(d, d.itemA);
    await dropAtStoreWithdrawal(d, d.itemB); // último item: o frete devolvido é o PAGO (zero)
    expect(await refundsOf(d.orderId)).toEqual([8_000, 8_000]);
  });

  it('I4: desconto de item com centavos quebrados é rateado exato (a soma dos reembolsos dos itens = itens - desconto)', async () => {
    const shop: Shop = await shopWith(ctx, [
      { name: 'A', priceCents: 3_333, stock: 9 },
      { name: 'B', priceCents: 3_334, stock: 9 },
      { name: 'C', priceCents: 3_333, stock: 9 },
    ]);
    const buyer = await customerAt(ctx, shop.origin);
    for (const v of shop.variants) await addToCart(ctx, buyer.user, v, 1).expect(200);
    const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'store', storeId: shop.store.id, value: 100 });
    await ctx.http.put('/v1/cart/coupon').set(bearer(buyer.user.accessToken)).send({ code: coupon.code }).expect(200);
    const created = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = created.body.id as string;
    await approve(ctx, buyer.user, (await attemptOf(ctx, orderId)).id);
    const order = await orderRow(ctx, orderId);
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7 }).where(eq(orders.id, orderId));
    const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const d: Delivered = { shop, buyer, orderId, items, itemA: items[0]!, itemB: items[1]! };
    for (const item of items) await dropAtStoreWithdrawal(d, item);
    const refunds = await refundsOf(orderId);
    expect(refunds.reduce((s, v) => s + v, 0)).toBe(order.subtotalCents - order.discountCents + order.deliveryFeeCents);
  });

  async function awaitingFeeWithDifference() {
    const d = await deliveredOrder();
    const [orig] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, d.itemA.variantId));
    const [bigger] = await ctx.db.insert(productVariants).values({ productId: orig!.productId, storeId: d.shop.store.id, attributes: { Tamanho: 'GG' }, attributesKey: `tamanho=gg-${randomUUID()}`, priceCents: 9_000, stock: 5, reserved: 0 }).returning();
    const r = await request(d, { orderItemId: d.itemA.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: bigger!.id }).expect(201);
    const accepted = await ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${r.body.id}/accept`).set(owner(d)).send({}).expect(200);
    return { d, id: r.body.id as string, accepted: accepted.body };
  }

  it('I12: a diferença de preço positiva é cobrada na conta da LOJA com split (application_fee = taxa + comissão da diferença) e o ledger fecha', async () => {
    const { d, id, accepted } = await awaitingFeeWithDifference();
    expect(accepted).toMatchObject({ status: 'awaiting_fee', fee: { amount: 900 }, difference: { amount: 1_000 }, totalDue: { amount: 1_900 } });
    await ctx.http.post(`/v1/exchanges/${id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    const [attempt] = await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${id}`));
    const commission = Math.round((1_000 * d.itemA.commissionPctBp) / 10_000);
    expect(commission).toBeGreaterThan(0);
    expect(attempt).toMatchObject({ storeId: d.shop.store.id, amountCents: 1_900, applicationFeeCents: 900 + commission });
    const before = await ledger.balances(d.orderId);
    await approve(ctx, d.buyer.user, attempt!.id);
    const after = await ledger.balances(d.orderId);
    expect(after.exchangeFeeRevenue - before.exchangeFeeRevenue).toBe(900);
    expect(after.commissionRevenue - before.commissionRevenue).toBe(commission);
    expect(after.merchantPayable - before.merchantPayable).toBe(1_000 - commission); // nada de passivo: a loja recebe a diferença menos a comissão
    expect(after.exchangeReceivedCents).toBe(1_900);
    expect((await ledger.verifyOrder(d.orderId)).ok).toBe(true);
  });

  it('I12: sem diferença de preço a taxa segue na conta da Webag, sem split', async () => {
    const d = await deliveredOrder();
    const [orig] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, d.itemA.variantId));
    const [sameSize] = await ctx.db.insert(productVariants).values({ productId: orig!.productId, storeId: d.shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
    const r = await request(d, { orderItemId: d.itemA.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: sameSize!.id }).expect(201);
    await ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${r.body.id}/accept`).set(owner(d)).send({}).expect(200);
    await ctx.http.post(`/v1/exchanges/${r.body.id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    const [attempt] = await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${r.body.id}`));
    expect(attempt).toMatchObject({ storeId: null, amountCents: 900, applicationFeeCents: 0 });
  });

  it('I6: soma do extrato = líquido do resumo, com troca com diferença e pedido pago e depois cancelado', async () => {
    const { d, id } = await awaitingFeeWithDifference();
    await ctx.http.post(`/v1/exchanges/${id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    const [attempt] = await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${id}`));
    await approve(ctx, d.buyer.user, attempt!.id);
    // outro pedido da mesma loja, pago e cancelado pelo admin (a tarifa do provedor não volta)
    const buyer2 = await customerAt(ctx, d.shop.origin);
    await addToCart(ctx, buyer2.user, d.shop.variants[1]!, 1).expect(200);
    const second = await placeOrder(ctx, buyer2.user, buyer2.addressId);
    expect(second.status).toBe(201);
    await approve(ctx, buyer2.user, (await attemptOf(ctx, second.body.id)).id);
    const superAdmin = await createAdmin(ctx, 'super_admin');
    await ctx.http.post(`/v1/admin/orders/${second.body.id}/cancel`).set(bearer(superAdmin.accessToken)).send({ reason: 'cancelado para o teste do extrato' }).expect(200);

    const base = `/v1/stores/${d.shop.store.id}/finance`;
    const summary = (await ctx.http.get(`${base}/summary?${range}`).set(owner(d)).expect(200)).body;
    const statement = (await ctx.http.get(`${base}/statement?${range}&limit=100`).set(owner(d)).expect(200)).body;
    expect(statement.data.map((l: { orderId: string }) => l.orderId)).toContain(second.body.id); // o pago e cancelado aparece
    const sum = (statement.data as { net: { amount: number } }[]).reduce((s, l) => s + l.net.amount, 0);
    expect(sum).toBe(summary.net.amount);
    const receivable = summary.receivable;
    const totalReceivable = receivable.pending.amount.amount + receivable.inGrace.amount.amount + receivable.released.amount.amount;
    expect(totalReceivable).toBe(summary.net.amount); // "a receber" = a mesma definição, todo o histórico da loja (aqui, só este período)
  });
});
