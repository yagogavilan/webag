import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/index.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { auditLog, ledgerTransactions, paymentAlerts, paymentAttempts, paymentRefundIntents } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs, reconcileFirst } from './helpers/fixtures.js';
import { addToCart, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** R.3: chargeback visível (I2) e tarifa do provedor recuperável na conciliação (I3). */
describe('Chargeback e tarifa tardia do provedor (R.3, I2, I3)', () => {
  let ctx: TestContext;
  let fake: FakePaymentProvider;
  let payments: PaymentsService;
  let ledger: LedgerService;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    fake = ctx.app.get(FakePaymentProvider);
    payments = ctx.app.get(PaymentsService);
    ledger = ctx.app.get(LedgerService);
    superAdmin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(() => ctx.close());

  /** Pedido PIX aprovado no provedor SEM tarifa (como o MP logo após aprovar) e conciliado. */
  async function paidWithoutFee() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const res = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(res.status).toBe(201);
    const orderId = res.body.id as string;
    const attempt = await attemptOf(ctx, orderId);
    await fake.simulate(attempt.providerPaymentId!, { outcome: 'approved', reportedProviderFeeCents: 0 });
    await ctx.db.update(paymentAttempts).set({ createdAt: new Date(Date.now() - 10 * 60_000) }).where(eq(paymentAttempts.id, attempt.id));
    await reconcileNow(attempt.id);
    expect((await orderRow(ctx, orderId)).status).toBe('received');
    return { orderId, attempt, shop };
  }
  /**
   * BUG-019 (e): a conciliação lê no máximo 200 tentativas, das mais antigas para as mais novas, num banco que os outros arquivos já
   * encheram; sem passar a tentativa deste teste para a frente da fila ela ficava de fora conforme a ordem e o volume (flakiness por dados compartilhados).
   */
  const reconcileNow = async (attemptId: string) => {
    await reconcileFirst(ctx, attemptId);
    await payments.reconcile();
  };
  const feeTransactions = (orderId: string) => ctx.db.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.orderId, orderId), eq(ledgerTransactions.kind, 'provider_fee')));

  it('I3: aprovado sem fee_details na 1ª leitura; a conciliação traz a tarifa e o ledger a lança UMA vez', async () => {
    const o = await paidWithoutFee();
    expect(await feeTransactions(o.orderId)).toHaveLength(0);
    await fake.simulate(o.attempt.providerPaymentId!, { outcome: 'approved', reportedProviderFeeCents: 104 });
    await reconcileNow(o.attempt.id);
    await reconcileNow(o.attempt.id); // repetir não duplica
    expect(await feeTransactions(o.orderId)).toHaveLength(1);
    expect((await ledger.balances(o.orderId)).providerFeeCents).toBe(104);
    expect((await ledger.verifyOrder(o.orderId)).ok).toBe(true);
  });

  it('I2: chargeback vira alerta payment_disputed, marca o pedido, lança no ledger e fecha as contas; repetir não duplica', async () => {
    const o = await paidWithoutFee();
    await fake.simulate(o.attempt.providerPaymentId!, { outcome: 'approved', reportedProviderFeeCents: 104, disputed: true });
    await reconcileNow(o.attempt.id);
    await reconcileNow(o.attempt.id);
    const order = await orderRow(ctx, o.orderId);
    expect(order.status).toBe('received'); // o ciclo de vida segue; a contestação é marca à parte
    expect(order.disputedAt).not.toBeNull();
    const alerts = await ctx.db.select().from(paymentAlerts).where(and(eq(paymentAlerts.attemptId, o.attempt.id), eq(paymentAlerts.kind, 'payment_disputed')));
    expect(alerts).toHaveLength(1);
    const b = await ledger.balances(o.orderId);
    expect(b.chargebackCents).toBe(order.totalCents);
    expect(b.merchantPayable).toBeLessThan(0); // a loja passa a dever a parte dela (o MP debitou a conta dela)
    expect(b.commissionRevenue).toBe(0);
    expect((await ledger.verifyOrder(o.orderId)).ok).toBe(true);
    const adjustments = await ctx.db.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.orderId, o.orderId), eq(ledgerTransactions.kind, 'adjustment')));
    expect(adjustments).toHaveLength(1);
    expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, o.orderId), eq(auditLog.action, 'order.disputed'))))).toHaveLength(1);
  });

  it('I2: pedido contestado não aceita estorno manual (o provedor já debitou) e o cancelamento do admin não agenda estorno', async () => {
    const o = await paidWithoutFee();
    await fake.simulate(o.attempt.providerPaymentId!, { outcome: 'approved', reportedProviderFeeCents: 104, disputed: true });
    await reconcileNow(o.attempt.id);
    const refund = await ctx.http.post(`/v1/admin/orders/${o.orderId}/refunds`).set(bearer(superAdmin.accessToken)).set('Idempotency-Key', randomUUID()).send({ amountCents: 1_000, reason: 'estorno em pedido contestado' });
    expect(refund.status).toBe(409);
    expect(refund.body.code).toBe('ORDER_DISPUTED');
    await ctx.http.post(`/v1/admin/orders/${o.orderId}/cancel`).set(bearer(superAdmin.accessToken)).send({ reason: 'cancelar pedido contestado, teste' }).expect(200);
    expect(await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, o.attempt.id))).toHaveLength(0);
    expect((await ledger.verifyOrder(o.orderId)).ok).toBe(true);
  });
});
