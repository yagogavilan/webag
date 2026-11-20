import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { LedgerService } from '../src/modules/finance/index.js';
import { AppError } from '../src/platform/http/app-error.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { auditLog, paymentRefundIntents, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/** SEC-039: estorno manual do admin (total e parcial), com perfil, limite, idempotência e auditoria. */
describe('Estorno manual do admin (SEC-039)', () => {
  let ctx: TestContext;
  let fake: FakePaymentProvider;
  let ledger: LedgerService;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    fake = ctx.app.get(FakePaymentProvider);
    ledger = ctx.app.get(LedgerService);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });
  afterEach(() => vi.restoreAllMocks());

  /** Pedido pago de R$ 100,00 de itens + frete e taxas (total R$ 105,00). */
  async function paidOrder() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 10 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const order = (await placeOrder(ctx, user, addressId)).body as { id: string; total: { amount: number } };
    const attempt = await attemptOf(ctx, order.id);
    await approve(ctx, user, attempt.id);
    return { order, attempt, user };
  }
  const refund = (token: string, orderId: string, body: Record<string, unknown>, key: string | null = randomUUID()) => {
    const req = ctx.http.post(`/v1/admin/orders/${orderId}/refunds`).set(bearer(token));
    return (key ? req.set('Idempotency-Key', key) : req).send(body);
  };

  it('parcial e depois o resto: soma <= pago, ledger fecha, auditoria por estorno e a chave repetida não estorna de novo', async () => {
    const { order, attempt } = await paidOrder();
    const finance = await createAdmin(ctx, 'finance');
    const total = attempt.amountCents;
    const key = randomUUID();
    const first = await refund(finance.accessToken, order.id, { amountCents: 3_000, reason: 'produto veio avariado' }, key);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ status: 'done', refunded: { amount: 3_000 }, remaining: { amount: total - 3_000 } });
    const again = await refund(finance.accessToken, order.id, { amountCents: 3_000, reason: 'produto veio avariado' }, key); // reenvio do cliente HTTP
    expect(again.status).toBe(200);
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(1);
    expect((await refund(finance.accessToken, order.id, { amountCents: 3_500, reason: 'produto veio avariado' }, key)).body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    expect((await refund(finance.accessToken, order.id, { amountCents: total, reason: 'quer mais que o pago' })).body.code).toBe('REFUND_EXCEEDS_PAID');
    const rest = await refund(finance.accessToken, order.id, { amountCents: total - 3_000, reason: 'estorno do restante do pedido' });
    expect(rest.body).toMatchObject({ status: 'done', remaining: { amount: 0 } });
    expect((await fake.getPayment(attempt.providerPaymentId!))?.refundedCents).toBe(total);
    expect(await ledger.balances(order.id)).toMatchObject({ refundedCents: total, commissionRevenue: 0, serviceFeeRevenue: 0 });
    expect((await ledger.verifyOrder(order.id)).ok).toBe(true);
    const audits = (await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, attempt.id))).filter((a) => a.action === 'payment.refund');
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ actorId: finance.userId, actorRole: 'finance' });
  });

  it('perfil e limite: suporte e lojista não podem; financeiro até o limite, acima só o super admin; sem Idempotency-Key ou motivo é 400', async () => {
    const { order, attempt, user } = await paidOrder();
    const support = await createAdmin(ctx, 'support');
    const finance = await createAdmin(ctx, 'finance');
    const superAdmin = await createAdmin(ctx, 'super_admin');
    await refund(support.accessToken, order.id, { amountCents: 100, reason: 'perfil sem permissão aqui' }).expect(403);
    await refund(user.accessToken, order.id, { amountCents: 100, reason: 'cliente não é admin aqui' }).expect(403);
    await ctx.http.post(`/v1/admin/orders/${order.id}/refunds`).send({ amountCents: 100, reason: 'sem login nenhum' }).expect(401);
    expect((await refund(finance.accessToken, order.id, { amountCents: 100, reason: 'curto' })).status).toBe(400);
    expect((await refund(finance.accessToken, order.id, { amountCents: 100, reason: 'sem chave de idempotência' }, null)).status).toBe(400);
    await refund(finance.accessToken, randomUUID(), { amountCents: 100, reason: 'pedido que não existe aqui' }).expect(404);

    const setCap = (value: number) => ctx.http.put('/v1/admin/parameters/estorno_super_admin_cents').set(bearer(superAdmin.accessToken)).send({ value, reason: 'teste do limite do financeiro' });
    expect((await setCap(2_000)).status).toBe(200);
    const blocked = await refund(finance.accessToken, order.id, { amountCents: 2_001, reason: 'acima do limite do financeiro' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('SUPER_ADMIN_REQUIRED');
    await refund(finance.accessToken, order.id, { amountCents: 2_000, reason: 'dentro do limite do financeiro' }).expect(200);
    await refund(superAdmin.accessToken, order.id, { amountCents: attempt.amountCents - 2_000, reason: 'super admin estorna o restante' }).expect(200);
    expect((await setCap(50_000)).status).toBe(200);
  });

  it('pedido sem pagamento confirmado: 409; provedor recusa: 200 `queued` e o estorno fica na fila, sem perder a chave', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const unpaid = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    const finance = await createAdmin(ctx, 'finance');
    await refund(finance.accessToken, unpaid.id, { amountCents: 100, reason: 'pedido ainda não foi pago' }).expect(409);

    const { order, attempt } = await paidOrder();
    vi.spyOn(fake, 'refund').mockRejectedValue(new AppError(502, 'PAYMENT_PROVIDER_AUTH', 'Conta de pagamento da loja não autorizada'));
    const key = randomUUID();
    const res = await refund(finance.accessToken, order.id, { amountCents: 1_000, reason: 'provedor fora do ar agora' }, key);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe('queued');
    expect(await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, attempt.id))).toMatchObject([{ status: 'pending', failures: 1, actorId: finance.userId }]);
  });
});
