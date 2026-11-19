import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { LedgerService } from '../src/modules/finance/index.js';
import { AppError } from '../src/platform/http/app-error.js';
import { SellerCredentialsRegistry } from '../src/modules/payments/index.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { auditLog, paymentAlerts, paymentAttempts, paymentRefundIntents, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { connectFakeAccount, createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

const DAY = 86_400_000;

/** SEC-130: estorno recusado pelo provedor não some: backoff, alerta, fila do admin, nova tentativa e cobertura da Webag. */
describe('Estorno recusado pelo provedor (SEC-130)', () => {
  let ctx: TestContext;
  let payments: PaymentsService;
  let fake: FakePaymentProvider;
  let ledger: LedgerService;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    payments = ctx.app.get(PaymentsService);
    fake = ctx.app.get(FakePaymentProvider);
    ledger = ctx.app.get(LedgerService);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });
  afterEach(() => vi.restoreAllMocks());

  /** Pedido pago de R$ 80,00 + frete e taxas, cancelado pelo cliente com o provedor recusando o estorno (conta da loja revogada). */
  async function cancelledWithRefusedRefund() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 5 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const order = (await placeOrder(ctx, user, addressId)).body as { id: string };
    const attempt = await attemptOf(ctx, order.id);
    await approve(ctx, user, attempt.id);
    const refuse = vi.spyOn(fake, 'refund').mockRejectedValue(new AppError(502, 'PAYMENT_PROVIDER_AUTH', 'Conta de pagamento da loja não autorizada'));
    await ctx.http.post(`/v1/orders/${order.id}/cancel`).set(bearer(user.accessToken)).send({}).expect(200);
    const [intent] = await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, attempt.id));
    return { order, attempt, intent: intent!, refuse };
  }
  const alertKinds = async (attemptId: string, open = false) =>
    (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.attemptId, attemptId))).filter((a) => !open || a.resolvedAt === null).map((a) => a.kind);

  it('recusa não fica em silêncio: conta a falha, agenda nova tentativa com backoff e alerta; quando o provedor volta, estorna UMA vez e fecha o alerta', async () => {
    const { attempt, intent, refuse } = await cancelledWithRefusedRefund();
    expect(intent).toMatchObject({ status: 'pending', failures: 1, lastErrorCode: 'PAYMENT_PROVIDER_AUTH' });
    expect(intent.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000); // 5 min
    expect(await alertKinds(attempt.id, true)).toEqual(['refund_failed']);

    // antes da hora a conciliação não toca o provedor de novo
    refuse.mockClear();
    await payments.reconcile(new Date());
    expect(refuse).not.toHaveBeenCalled();

    // provedor volta; a conciliação depois do backoff conclui com a mesma chave
    vi.restoreAllMocks();
    await payments.reconcile(new Date(Date.now() + 10 * 60_000));
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id));
    expect(refunds).toHaveLength(1);
    expect((await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.id, intent.id)))[0]!.status).toBe('done');
    expect(await alertKinds(attempt.id, true)).toEqual([]);
    expect((await ledger.verifyOrder(attempt.externalReference)).ok).toBe(true);
  });

  it('esgota as tentativas: vira `exhausted`, alerta `refund_exhausted`, aparece na fila do admin e some da fila quando concluído por nova tentativa manual', async () => {
    const { attempt, intent } = await cancelledWithRefusedRefund();
    for (let n = 1; n <= 6; n++) await payments.reconcile(new Date(Date.now() + n * 2 * DAY));
    const exhausted = (await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.id, intent.id)))[0]!;
    expect(exhausted).toMatchObject({ status: 'exhausted', failures: 6 });
    expect(await alertKinds(attempt.id, true)).toContain('refund_exhausted');

    const finance = await createAdmin(ctx, 'finance');
    const support = await createAdmin(ctx, 'support');
    await ctx.http.get('/v1/admin/payments/refund-queue').set(bearer(support.accessToken)).expect(403);
    const queue = (await ctx.http.get('/v1/admin/payments/refund-queue?status=exhausted').set(bearer(finance.accessToken)).expect(200)).body as { data: { id: string; orderReference: string; amountCents: number; status: string }[] };
    expect(queue.data.find((i) => i.id === intent.id)).toMatchObject({ orderReference: attempt.externalReference, status: 'exhausted', amountCents: 8_500 });

    // a loja reconectou (o provedor volta a aceitar): o financeiro manda tentar de novo (não pode cobrir: só super admin)
    await ctx.http.post(`/v1/admin/payments/refund-queue/${intent.id}/cover`).set(bearer(finance.accessToken)).send({ reason: 'tentando cobrir sem permissão' }).expect(403);
    vi.restoreAllMocks();
    const retry = await ctx.http.post(`/v1/admin/payments/refund-queue/${intent.id}/retry`).set(bearer(finance.accessToken)).send({});
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
    expect(retry.body.status).toBe('done');
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(1);
    expect((await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, intent.id))).map((a) => a.action)).toContain('payment.refund_retry');
    await ctx.http.post(`/v1/admin/payments/refund-queue/${intent.id}/retry`).set(bearer(finance.accessToken)).send({}).expect(409); // já concluído
  });

  it('cobertura da Webag: só super admin, com motivo; lança no ledger (dívida da loja), não estorna no provedor e respeita o teto', async () => {
    const { attempt, intent } = await cancelledWithRefusedRefund();
    for (let n = 1; n <= 6; n++) await payments.reconcile(new Date(Date.now() + n * 2 * DAY));
    const superAdmin = await createAdmin(ctx, 'super_admin');
    const url = `/v1/admin/payments/refund-queue/${intent.id}/cover`;

    await ctx.http.post(url).set(bearer(superAdmin.accessToken)).send({ reason: 'curto' }).expect(400);
    // teto: R$ 85,00 > R$ 50,00 configurado agora
    const setCap = (value: number) => ctx.http.put('/v1/admin/parameters/estorno_cobertura_teto_cents').set(bearer(superAdmin.accessToken)).send({ value, reason: 'teste do teto de cobertura' });
    expect((await setCap(5_000)).status).toBe(200);
    const over = await ctx.http.post(url).set(bearer(superAdmin.accessToken)).send({ reason: 'cliente ficou sem o dinheiro' });
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('COVERAGE_ABOVE_LIMIT');
    expect((await setCap(30_000)).status).toBe(200);
    await ctx.http.post(url).set(bearer(superAdmin.accessToken)).send({ reason: 'cliente ficou sem o dinheiro' }).expect(204);

    expect((await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.id, intent.id)))[0]).toMatchObject({ status: 'covered', coveredBy: superAdmin.userId });
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(0);
    const kinds = await alertKinds(attempt.id, true);
    expect(kinds).toContain('refund_covered_payout_pending');
    expect(kinds).not.toContain('refund_exhausted');
    const b = await ledger.balances(attempt.externalReference);
    expect(b).toMatchObject({ coveredCents: 8_500, refundedCents: 0, commissionRevenue: 0, serviceFeeRevenue: 0 });
    expect(b.merchantPayable).toBeLessThan(0); // a loja deve à Webag o que ela devolveu ao cliente
    expect((await ledger.verifyOrder(attempt.externalReference)).ok).toBe(true);
    // coberto não volta a ser estornado no provedor, nem pela conciliação nem por repetição do cancelamento
    vi.restoreAllMocks();
    await payments.reconcile(new Date(Date.now() + 20 * DAY));
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(0);
    await ctx.http.post(url).set(bearer(superAdmin.accessToken)).send({ reason: 'cliente ficou sem o dinheiro' }).expect(409);
    expect((await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, intent.id))).map((a) => a.action)).toContain('payment.refund_covered');
  });

  it('o estorno usa os tokens da conta que RECEBEU, mesmo depois de a loja desconectar ou trocar de conta', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 5 }]);
    const owner = shop.store.owner;
    const registry = ctx.app.get(SellerCredentialsRegistry);
    const accounts = await import('../src/platform/database/schema.js');
    await ctx.db.delete(accounts.paymentAccounts).where(eq(accounts.paymentAccounts.storeId, shop.store.id)); // a conta de fábrica do helper tem tokens fictícios
    const res = await connectFakeAccount(ctx, owner, shop.store.id, 'fake-ok:conta-a');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [first] = await ctx.db.select().from(accounts.paymentAccounts).where(eq(accounts.paymentAccounts.storeId, shop.store.id));
    const accountA = first!.providerAccountId;
    expect((await registry.resolve(shop.store.id))?.providerAccountId).toBe(accountA);

    await connectFakeAccount(ctx, owner, shop.store.id, 'fake-ok:conta-b-nova');
    expect((await registry.resolve(shop.store.id))?.providerAccountId).toBe('conta-b-nova'); // cobrança nova: conta ativa
    expect((await registry.resolve(shop.store.id, accountA))?.providerAccountId).toBe(accountA); // estorno antigo: a conta que recebeu
    expect(await registry.resolve(shop.store.id, 'conta-de-outra-loja')).toBeNull(); // nunca token de conta que não é desta loja
    const other = await shopWith(ctx, [{ name: 'Outro', priceCents: 1_000, stock: 1 }]);
    expect(await registry.resolve(other.store.id, accountA)).toBeNull();
  });

  it('a tentativa guarda o recebedor no momento da cobrança', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const order = (await placeOrder(ctx, user, addressId)).body as { id: string };
    const attempt = await attemptOf(ctx, order.id);
    expect(attempt.receiverAccountId).toBe(`fake-seller-${shop.store.id}`);
    expect((await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, attempt.id)))[0]!.status).toBe('pending');
  });
});
