import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/index.js';
import { deliveries, exchangeRequests, orderItems, orders, paymentAttempts, paymentRefunds, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/** DT-049: a taxa da troca (receita da Webag) e o custo da coleta (despesa de logística) entram no ledger, com números fechando. */
describe('Ledger da troca e da logística (DT-049)', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let finance: Awaited<ReturnType<typeof createAdmin>>;
  const base = '/v1/admin/logistics';

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ledger = ctx.app.get(LedgerService);
    ops = await createAdmin(ctx, 'operations');
    finance = await createAdmin(ctx, 'finance');
  });
  afterAll(() => ctx.close());

  /** Pedido de R$ 80 entregue (marcado no banco), com variação M e taxa de troca de R$ 9,00. */
  async function delivered(sizeMPriceCents?: number) {
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const [order] = await ctx.db.select().from(orders).where(eq(orders.id, created.id));
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7, deliverySnapshot: { ...(order!.deliverySnapshot ?? {}), exchangeFeeCents: 900, expectedCostCents: 700 } }).where(eq(orders.id, created.id));
    const productId = (await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!)))[0]!.productId;
    const [sizeM] = await ctx.db.insert(productVariants).values({ productId, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0, ...(sizeMPriceCents ? { priceCents: sizeMPriceCents } : {}) }).returning();
    const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, created.id));
    return { shop, buyer, orderId: created.id, sizeM: sizeM!, itemId: item!.id };
  }
  type Delivered = Awaited<ReturnType<typeof delivered>>;
  const exchange = async (d: Delivered, body: Record<string, unknown>) => (await ctx.http.post(`/v1/orders/${d.orderId}/exchanges`).set(bearer(d.buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send(body).expect(201)).body as { id: string };
  const exchangeAttempts = (id: string) => ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${id}`));
  const byKind = async (orderId: string, kind: string) => (await ledger.lines(orderId)).filter((l) => l.kind === kind).map((l) => `${l.account}:${l.direction}:${l.amountCents}`).sort();

  /** Tamanho/cor com coleta em casa, taxa R$ 9,00 + diferença R$ 15,00, paga por PIX. */
  async function paidSizeExchange() {
    const d = await delivered(9_500);
    const ex = await exchange(d, { orderItemId: d.itemId, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: d.sizeM.id });
    await ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${ex.id}/accept`).set(bearer(d.shop.store.owner.accessToken)).send({}).expect(200);
    await ctx.http.post(`/v1/exchanges/${ex.id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    const [attempt] = await exchangeAttempts(ex.id);
    await approve(ctx, d.buyer.user, attempt!.id);
    return { d, ex, attempt: attempt! };
  }

  it('taxa paga: R$ 24,00 entram no provedor; R$ 9,00 são receita da Webag e a diferença de R$ 15,00 vai à loja menos a comissão (I12: split); o lançamento é idempotente e fecha', async () => {
    const { d, ex, attempt } = await paidSizeExchange();
    expect(attempt.amountCents).toBe(2_400);
    expect(await byKind(d.orderId, 'exchange_fee')).toEqual(['commission_revenue:credit:150', 'exchange_fee_revenue:credit:900', 'merchant_payable:credit:1350', 'provider_clearing:debit:2400']);
    const b = await ledger.balances(d.orderId);
    expect(b).toMatchObject({ exchangeFeeRevenue: 900, exchangeReceivedCents: 2_400, exchangeRefundedCents: 0 });
    expect((await ledger.verifyOrder(d.orderId)).ok).toBe(true);
    // repetir o webhook/aprovação não lança de novo
    await ctx.http.post(`/v1/dev/payments/${attempt.id}/approve`).set(bearer(d.buyer.user.accessToken)).send({});
    expect(await byKind(d.orderId, 'exchange_fee')).toHaveLength(4);
    expect(await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, ex.id))).toHaveLength(1);
  });

  it('troca cancelada: o estorno da taxa e da diferença reverte a receita e o a favor da loja; saldo da troca volta a zero', async () => {
    const { d, ex, attempt } = await paidSizeExchange();
    await ctx.http.post(`/v1/exchanges/${ex.id}/cancel`).set(bearer(d.buyer.user.accessToken)).send({}).expect(200);
    expect((await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).map((r) => r.amountCents)).toEqual([2_400]);
    expect(await byKind(d.orderId, 'exchange_fee_refund')).toEqual(['commission_revenue:debit:150', 'exchange_fee_revenue:debit:900', 'merchant_payable:debit:1350', 'provider_clearing:credit:2400']);
    const b = await ledger.balances(d.orderId);
    expect(b).toMatchObject({ exchangeFeeRevenue: 0, exchangeReceivedCents: 2_400, exchangeRefundedCents: 2_400 });
    expect((await ledger.verifyOrder(d.orderId)).ok).toBe(true);
  });

  it('custo da coleta: lança a despesa a pagar ao motoboy, corrige só a diferença (para cima e para baixo) e quita quando o financeiro marca como pago', async () => {
    const d = await delivered();
    const ex = await exchange(d, { orderItemId: d.itemId, type: 'withdrawal', method: 'pickup_at_home' }); // coleta grátis: custo da Webag
    const [run] = await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, ex.id));
    const courier = (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: 'Carlos Moto Silva', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
    await ctx.http.post(`${base}/deliveries/${run!.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: courier.id }).expect(200);
    for (const action of ['confirm', 'picked_up', 'delivered']) await ctx.http.post(`${base}/deliveries/${run!.id}/status`).set(bearer(ops.accessToken)).send({ action }).expect(200);

    const put = (costCents: number, reason?: string) => ctx.http.put(`${base}/deliveries/${run!.id}/cost`).set(bearer(ops.accessToken)).send({ costCents, ...(reason ? { reason } : {}) });
    await put(700).expect(200);
    expect(await byKind(d.orderId, 'logistics_cost')).toEqual(['courier_payable:credit:700', 'logistics_cost_expense:debit:700']);
    await put(900, 'motoboy esperou 20 min na porta').expect(200); // +200
    await put(800, 'corrigido depois da conferência').expect(200); // -100
    expect(await byKind(d.orderId, 'logistics_cost')).toEqual(
      ['courier_payable:credit:700', 'courier_payable:credit:200', 'courier_payable:debit:100', 'logistics_cost_expense:credit:100', 'logistics_cost_expense:debit:200', 'logistics_cost_expense:debit:700'].sort(),
    );
    expect(await ledger.balances(d.orderId)).toMatchObject({ logisticsCostExpense: 800, courierPayable: 800, courierPaidCents: 0 });
    await put(800, 'mesmo valor, sem lançamento novo').expect(200);
    expect((await ledger.lines(d.orderId)).filter((l) => l.kind === 'logistics_cost')).toHaveLength(6);

    // quem lançou (operação) não paga; o financeiro paga e o a pagar zera
    await ctx.http.post(`${base}/deliveries/payouts`).set(bearer(finance.accessToken)).send({ deliveryIds: [run!.id], paidOn: '2026-11-20' }).expect(200);
    expect(await byKind(d.orderId, 'courier_payout')).toEqual(['courier_payable:debit:800', 'courier_payout_cash:credit:800']);
    expect(await ledger.balances(d.orderId)).toMatchObject({ logisticsCostExpense: 800, courierPayable: 0, courierPaidCents: 800 });
    expect((await ledger.verifyOrder(d.orderId)).ok).toBe(true);
  });
});
