import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { AppError } from '../src/platform/http/app-error.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { paymentAlerts, paymentRefundIntents, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs, retirePreviousPaymentAttempts } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

const DAY = 86_400_000;

/** Aguarda a condição (o provedor lento foi chamado) sem dormir um tempo fixo. */
async function until(condition: () => boolean, ms = 5_000): Promise<void> {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error('condição não atingida');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** SEC-141: cobrir um estorno que ainda está no provedor paga o cliente 2 vezes. SEC-142: fracionar contorna o limite do financeiro. */
describe('SEC-141 e SEC-142: cobertura e limite do estorno manual', () => {
  let ctx: TestContext;
  let payments: PaymentsService;
  let fake: FakePaymentProvider;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await retirePreviousPaymentAttempts(ctx); // a conciliação olha só os 200 mais antigos: não deixe a suíte inteira empurrar os deste arquivo para fora
    await ensureCity(ctx, 'Francisco Morato');
    payments = ctx.app.get(PaymentsService);
    fake = ctx.app.get(FakePaymentProvider);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });
  afterEach(() => vi.restoreAllMocks());

  async function paidOrder(priceCents = 8_000) {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents, stock: 10 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const order = (await placeOrder(ctx, user, addressId)).body as { id: string };
    const attempt = await attemptOf(ctx, order.id);
    await approve(ctx, user, attempt.id);
    return { order, attempt, user };
  }
  const intentOf = async (attemptId: string) => (await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, attemptId)))[0]!;
  const alertKinds = async (attemptId: string, open = false) =>
    (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.attemptId, attemptId))).filter((a) => !open || a.resolvedAt === null).map((a) => a.kind);

  /** Pedido cancelado com o provedor recusando o estorno uma vez (intenção `pending`, 1 falha). */
  async function pendingWithOneFailure() {
    const { order, attempt, user } = await paidOrder();
    vi.spyOn(fake, 'refund').mockRejectedValueOnce(new AppError(502, 'PAYMENT_PROVIDER_AUTH', 'Conta de pagamento da loja não autorizada'));
    await ctx.http.post(`/v1/orders/${order.id}/cancel`).set(bearer(user.accessToken)).send({}).expect(200);
    const intent = await intentOf(attempt.id);
    expect(intent).toMatchObject({ status: 'pending', failures: 1 });
    return { order, attempt, intent };
  }

  it('SEC-141: intenção `pending` com falhas NÃO pode ser coberta (só `exhausted`)', async () => {
    const { intent } = await pendingWithOneFailure();
    const superAdmin = await createAdmin(ctx, 'super_admin');
    const res = await ctx.http.post(`/v1/admin/payments/refund-queue/${intent.id}/cover`).set(bearer(superAdmin.accessToken)).send({ reason: 'tentando cobrir antes de esgotar' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect((await intentOf(intent.attemptId)).status).toBe('pending');
  });

  it('SEC-141: conciliação com o provedor lento em voo: cobrir dá 409 e o provedor conclui UMA vez, com registro', async () => {
    const { attempt, intent } = await pendingWithOneFailure();
    const superAdmin = await createAdmin(ctx, 'super_admin');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const real = FakePaymentProvider.prototype.refund.bind(fake);
    const slow = vi.spyOn(fake, 'refund').mockImplementation(async (...args: Parameters<FakePaymentProvider['refund']>) => {
      await gate;
      return real(...args);
    });
    await ctx.db.update(paymentRefundIntents).set({ updatedAt: new Date(Date.now() - 10 * 60_000), nextAttemptAt: new Date() }).where(eq(paymentRefundIntents.id, intent.id));
    slow.mockClear(); // a chamada recusada do cancelamento já contou
    const recon = payments.reconcile(new Date(Date.now() + 10 * 60_000));
    await until(() => slow.mock.calls.length > 0);

    const cover = await ctx.http.post(`/v1/admin/payments/refund-queue/${intent.id}/cover`).set(bearer(superAdmin.accessToken)).send({ reason: 'cobrindo com o estorno em voo' });
    expect(cover.status, JSON.stringify(cover.body)).toBe(409);
    const finance = await createAdmin(ctx, 'finance');
    const retry = await ctx.http.post(`/v1/admin/payments/refund-queue/${intent.id}/retry`).set(bearer(finance.accessToken)).send({});
    expect(retry.status, JSON.stringify(retry.body)).toBe(409); // 2 chamadas simultâneas ao provedor com a mesma intenção

    release();
    await recon;
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(1);
    expect((await intentOf(attempt.id)).status).toBe('done');
    expect(await alertKinds(attempt.id)).not.toContain('refund_covered_payout_pending');
  });

  it('SEC-141: se o provedor concluir depois de a intenção ser `covered` (forçado), o estorno é SEMPRE registrado e abre `refund_double_paid`', async () => {
    const { attempt, intent } = await pendingWithOneFailure();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const real = FakePaymentProvider.prototype.refund.bind(fake);
    const slow = vi.spyOn(fake, 'refund').mockImplementation(async (...args: Parameters<FakePaymentProvider['refund']>) => {
      await gate;
      return real(...args);
    });
    await ctx.db.update(paymentRefundIntents).set({ updatedAt: new Date(Date.now() - 10 * 60_000), nextAttemptAt: new Date() }).where(eq(paymentRefundIntents.id, intent.id));
    slow.mockClear(); // a chamada recusada do cancelamento já contou
    const recon = payments.reconcile(new Date(Date.now() + 10 * 60_000));
    await until(() => slow.mock.calls.length > 0);
    await ctx.db.update(paymentRefundIntents).set({ status: 'covered', coveredAt: new Date(), coverageReason: 'forçado pelo teste' }).where(eq(paymentRefundIntents.id, intent.id));
    await payments.raiseAlert(attempt.id, 'refund_covered_payout_pending', { intentId: intent.id, amountCents: intent.amountCents });
    release();
    await recon;
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(1);
    expect(await alertKinds(attempt.id, true)).toContain('refund_double_paid');
    expect(await alertKinds(attempt.id, true)).not.toContain('refund_covered_payout_pending');
  });

  it('SEC-141: intenção `exhausted` sem estorno em voo continua podendo ser coberta', async () => {
    const { attempt, intent } = await pendingWithOneFailure();
    vi.spyOn(fake, 'refund').mockRejectedValue(new AppError(502, 'PAYMENT_PROVIDER_AUTH', 'Conta de pagamento da loja não autorizada'));
    for (let n = 1; n <= 6; n++) await payments.reconcile(new Date(Date.now() + n * 2 * DAY));
    expect((await intentOf(attempt.id)).status).toBe('exhausted');
    const superAdmin = await createAdmin(ctx, 'super_admin');
    await ctx.http.post(`/v1/admin/payments/refund-queue/${intent.id}/cover`).set(bearer(superAdmin.accessToken)).send({ reason: 'esgotado, a Webag cobre o cliente' }).expect(204);
    expect((await intentOf(attempt.id)).status).toBe('covered');
  });

  // ------------------------------------------------------------------------------------------ SEC-142

  const refund = (token: string, orderId: string, amountCents: number, key = randomUUID()) =>
    ctx.http.post(`/v1/admin/orders/${orderId}/refunds`).set(bearer(token)).set('Idempotency-Key', key).send({ amountCents, reason: 'estorno manual do teste' });

  it('SEC-142: o financeiro não contorna o limite fracionando (limite acumulado por pedido); o super admin continua podendo', async () => {
    const { order, attempt } = await paidOrder(100_000); // R$ 1.000 de item + frete e taxas
    const finance = await createAdmin(ctx, 'finance');
    const superAdmin = await createAdmin(ctx, 'super_admin');
    await refund(finance.accessToken, order.id, 20_000).expect(200);
    await refund(finance.accessToken, order.id, 20_000).expect(200); // soma R$ 400
    const third = await refund(finance.accessToken, order.id, 20_000); // soma R$ 600 > R$ 500
    expect(third.status, JSON.stringify(third.body)).toBe(403);
    expect(third.body.code).toBe('SUPER_ADMIN_REQUIRED');
    await refund(finance.accessToken, order.id, 10_000).expect(200); // soma R$ 500: ainda no limite
    await refund(finance.accessToken, order.id, 1).expect(403); // soma R$ 500,01
    await refund(superAdmin.accessToken, order.id, 20_000).expect(200);
    expect((await fake.getPayment(attempt.providerPaymentId!))?.refundedCents).toBe(70_000);
  });

  it('SEC-142: estornos simultâneos do financeiro também respeitam a soma (sem corrida)', async () => {
    const { order } = await paidOrder(100_000);
    const finance = await createAdmin(ctx, 'finance');
    const results = await Promise.all([1, 2, 3, 4].map(() => refund(finance.accessToken, order.id, 20_000)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2); // R$ 400; o 3º passaria de R$ 500
    expect(results.filter((r) => r.status === 403)).toHaveLength(2);
  });

  it('SEC-142: a repetição da mesma chave (rede ruim) não conta duas vezes na soma', async () => {
    const { order } = await paidOrder(100_000);
    const finance = await createAdmin(ctx, 'finance');
    const key = randomUUID();
    await refund(finance.accessToken, order.id, 40_000, key).expect(200);
    await refund(finance.accessToken, order.id, 40_000, key).expect(200);
    await refund(finance.accessToken, order.id, 10_000).expect(200);
  });

  it('SEC-142: teto diário por operador do financeiro, somando pedidos diferentes', async () => {
    const superAdmin = await createAdmin(ctx, 'super_admin');
    const finance = await createAdmin(ctx, 'finance');
    const setDaily = (value: number) => ctx.http.put('/v1/admin/parameters/estorno_financeiro_dia_cents').set(bearer(superAdmin.accessToken)).send({ value, reason: 'teste do teto diário do financeiro' });
    expect((await setDaily(60_000)).status).toBe(200);
    const a = await paidOrder(100_000);
    const b = await paidOrder(100_000);
    await refund(finance.accessToken, a.order.id, 40_000).expect(200);
    const over = await refund(finance.accessToken, b.order.id, 30_000); // 700 > 600 no dia, mesmo cada pedido abaixo de R$ 500
    expect(over.status, JSON.stringify(over.body)).toBe(403);
    expect(over.body.code).toBe('SUPER_ADMIN_REQUIRED');
    await refund(finance.accessToken, b.order.id, 20_000).expect(200); // 600: no teto
    await refund(superAdmin.accessToken, b.order.id, 30_000).expect(200);
    expect((await setDaily(200_000)).status).toBe(200);
  });
});
