// TEMPORÁRIO (security-engineer, 2026-11-19): ataques da revisão de logística/onda 4A. Não versionar.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { LedgerService } from '../src/modules/finance/index.js';
import { AppError } from '../src/platform/http/app-error.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { couponRedemptions, deliveries, orders, paymentAlerts, paymentAttempts, paymentRefundIntents, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, makeCoupon, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';
import { appendFileSync } from 'node:fs';
const log = (...a: unknown[]) => appendFileSync('/tmp/claude-0/-home-user-webag/93866cff-71c1-52eb-8518-dcff4af86ca9/scratchpad/attack.log', a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');
import { useFeeTable, restoreFees } from './helpers/fees.js';

const DAY = 86_400_000;

describe('SEC tmp: ataques', () => {
  let ctx: TestContext;
  let payments: PaymentsService;
  let fake: FakePaymentProvider;
  let ledger: LedgerService;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let support: Awaited<ReturnType<typeof createAdmin>>;
  let finance: Awaited<ReturnType<typeof createAdmin>>;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;
  const base = '/v1/admin/logistics';
  const store = (shop: Shop) => bearer(shop.store.owner.accessToken);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    payments = ctx.app.get(PaymentsService);
    fake = ctx.app.get(FakePaymentProvider);
    ledger = ctx.app.get(LedgerService);
    ops = await createAdmin(ctx, 'operations');
    support = await createAdmin(ctx, 'support');
    finance = await createAdmin(ctx, 'finance');
    superAdmin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });
  afterEach(() => vi.restoreAllMocks());

  async function paidOrder(priceCents = 10_000) {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const res = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const attempt = await attemptOf(ctx, res.body.id);
    await approve(ctx, buyer.user, attempt.id);
    return { shop, buyer, orderId: res.body.id as string, attempt };
  }
  async function readyOrder() {
    const r = await paidOrder(8_000);
    const url = `/v1/stores/${r.shop.store.id}/orders/${r.orderId}`;
    await ctx.http.post(`${url}/accept`).set(store(r.shop)).expect(200);
    const ready = await ctx.http.post(`${url}/status`).set(store(r.shop)).send({ status: 'ready_for_collection' });
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    const [delivery] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, r.orderId));
    return { ...r, url, delivery: delivery! };
  }
  const courier = async () => (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: `Moto ${randomUUID().slice(0, 4)}`, phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
  const act = (id: string, body: Record<string, unknown>) => ctx.http.post(`${base}/deliveries/${id}/status`).set(bearer(ops.accessToken)).send(body);
  const adminRefund = (token: string, orderId: string, amountCents: number) =>
    ctx.http.post(`/v1/admin/orders/${orderId}/refunds`).set(bearer(token)).set('Idempotency-Key', randomUUID()).send({ amountCents, reason: 'teste de seguranca do estorno' });

  it('A. cupom maxUses=1 sob concorrência (regressão do orders.e2e)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 5 }]);
    const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'store', storeId: shop.store.id, value: 1_000, maxUses: 1 });
    const a = await customerAt(ctx, shop.origin);
    const b = await customerAt(ctx, shop.origin);
    for (const c of [a, b]) {
      await addToCart(ctx, c.user, shop.variants[0]!, 1).expect(200);
      await ctx.http.put('/v1/cart/coupon').set(bearer(c.user.accessToken)).send({ code: coupon.code }).expect(200);
    }
    const [ra, rb] = await Promise.all([placeOrder(ctx, a.user, a.addressId), placeOrder(ctx, b.user, b.addressId)]);
    const reds = await ctx.db.select().from(couponRedemptions).where(eq(couponRedemptions.couponId, coupon.id));
    const rows = await Promise.all([ra, rb].filter((r) => r.status === 201).map((r) => orderRow(ctx, r.body.id)));
    log('A>', ra.status, ra.body.code, rb.status, rb.body.code, 'redemptions', reds.length, 'coupons on orders', rows.map((r) => [r.couponId, r.storeCouponCents]));
  });

  it('B. cobertura da Webag concorrente com estorno em andamento no provedor', async () => {
    const r = await paidOrder(8_000);
    vi.spyOn(fake, 'refund').mockRejectedValueOnce(new AppError(502, 'PAYMENT_PROVIDER_AUTH', 'revogada'));
    await ctx.http.post(`/v1/orders/${r.orderId}/cancel`).set(bearer(r.buyer.user.accessToken)).send({}).expect(200);
    const [intent] = await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, r.attempt.id));
    expect(intent).toMatchObject({ status: 'pending', failures: 1 });
    vi.restoreAllMocks();
    // provedor lento: o estorno da conciliação fica "no ar" enquanto o super admin cobre
    const real = fake.refund.bind(fake);
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    let entered!: () => void;
    const inside = new Promise<void>((res) => (entered = res));
    let calls = 0;
    vi.spyOn(fake, 'refund').mockImplementation(async (...args) => {
      calls++;
      entered();
      await gate;
      return real(...args);
    });
    const recon = payments.reconcile(new Date(Date.now() + 10 * 60_000));
    await Promise.race([inside, new Promise((res) => setTimeout(res, 5000))]);
    log('B> provedor chamado antes da cobertura:', calls);
    const cover = await ctx.http.post(`/v1/admin/payments/refund-queue/${intent!.id}/cover`).set(bearer(superAdmin.accessToken)).send({ reason: 'cliente sem o dinheiro ha dias' });
    release();
    await recon;
    const after = (await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.id, intent!.id)))[0]!;
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id));
    const b = await ledger.balances(r.orderId);
    log('B> provedor refundedCents', (await fake.getPayment(r.attempt.providerPaymentId!))?.refundedCents, 'cover', cover.status, cover.body?.code, 'intent', after.status, 'refunds no provedor', refunds.length, 'ledger covered', b.coveredCents, 'refunded', b.refundedCents, 'verify', (await ledger.verifyOrder(r.orderId)).ok);
  });

  it('C. financeiro fraciona estorno acima do limite do perfil (R$ 500)', async () => {
    const r = await paidOrder(120_000);
    const results = [] as number[];
    for (let i = 0; i < 3; i++) results.push((await adminRefund(finance.accessToken, r.orderId, 40_000)).status);
    const single = await adminRefund(finance.accessToken, r.orderId, 50_001);
    log('C> 3x R$400 pelo financeiro:', results, 'R$500,01 de uma vez:', single.status, single.body.code);
  });

  it('D/E. estornos concorrentes que somam mais que o pago e estorno acima do pago', async () => {
    const r = await paidOrder(10_000);
    const total = r.attempt.amountCents;
    const share = Math.ceil(total * 0.7);
    const res = await Promise.all([adminRefund(superAdmin.accessToken, r.orderId, share), adminRefund(superAdmin.accessToken, r.orderId, share), adminRefund(superAdmin.accessToken, r.orderId, share)]);
    const over = await adminRefund(superAdmin.accessToken, r.orderId, total + 1);
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id));
    log('D> concorrentes 3x70%:', res.map((x) => `${x.status}:${x.body.code ?? ''}`), 'estornado', refunds.reduce((s, x) => s + x.amountCents, 0), 'de', total, '| E> acima do pago:', over.status, over.body.code, '| provedor', (await fake.getPayment(r.attempt.providerPaymentId!))?.refundedCents);
  });

  it('F. mesma corrida atribuída 6x em paralelo', async () => {
    const r = await readyOrder();
    const cs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => courier()));
    const res = await Promise.all(cs.map((c) => ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: c.id, addressConfirmed: true })));
    const row = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!;
    log('F>', res.map((x) => `${x.status}:${x.body.code ?? ''}`), 'courier final', cs.findIndex((c) => c.id === row.courierId));
  });

  it('G. código de entrega: 20 palpites em paralelo', async () => {
    const r = await readyOrder();
    const c = await courier();
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: c.id, addressConfirmed: true }).expect(200);
    await act(r.delivery.id, { action: 'confirm' }).expect(200);
    await act(r.delivery.id, { action: 'picked_up' }).expect(200);
    const row = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!;
    const right = row.deliveryCode!;
    const guesses = Array.from({ length: 20 }, (_, i) => String((Number(right) + 1 + i) % 10_000).padStart(4, '0'));
    const res = await Promise.all(guesses.map((code) => act(r.delivery.id, { action: 'delivered', code })));
    const after = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!;
    const counts: Record<string, number> = {};
    for (const x of res) counts[`${x.status}:${x.body.code}`] = (counts[`${x.status}:${x.body.code}`] ?? 0) + 1;
    log('G> respostas', counts, 'codeFailures', after.codeFailures);
  });

  it('H. suporte e financeiro leem telefone/endereço do cliente e a mensagem de WhatsApp', async () => {
    const r = await readyOrder();
    const c = await courier();
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: c.id, addressConfirmed: true }).expect(200);
    const sup = await ctx.http.get(`${base}/deliveries/${r.delivery.id}/whatsapp`).set(bearer(support.accessToken));
    const fin = await ctx.http.get(`${base}/deliveries/${r.delivery.id}`).set(bearer(finance.accessToken));
    log('H> suporte whatsapp', sup.status, String(sup.body.message ?? '').slice(0, 220).replace(/\n/g, ' | '), '| financeiro detalhe contato', JSON.stringify(fin.body.contact));
    // depois de entregue: contato continua no banco?
    await act(r.delivery.id, { action: 'confirm' }).expect(200);
    await act(r.delivery.id, { action: 'picked_up' }).expect(200);
    const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!.deliveryCode;
    await act(r.delivery.id, { action: 'delivered', code }).expect(200);
    const done = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!;
    log('H> após entregue: contact no banco =', JSON.stringify(done.contact).slice(0, 160), 'piiClearedAt', done.piiClearedAt);
  });

  it('I. frete muda entre a cotação e o pedido (sem expectedTotalCents)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 5 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const cart = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    const seen = JSON.stringify(cart).match(/"total":\{"amount":(\d+)/)?.[1];
    await useFeeTable(ctx, [{ fromM: 0, toM: 15_000, feeCents: 4_900 }]);
    const res = await placeOrder(ctx, buyer.user, buyer.addressId);
    const withExpected = await placeOrder(ctx, buyer.user, buyer.addressId, { expectedTotalCents: Number(seen) });
    log('I> total visto', seen, '| sem expectedTotal:', res.status, res.body.code, res.body.summary?.total?.amount, '| com expectedTotal:', withExpected.status, withExpected.body.code);
    await restoreFees(ctx);
  });

  it('J. não entregue -> devolvida à loja sem a loja confirmar o recebimento; estorno total', async () => {
    const r = await readyOrder();
    const c = await courier();
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: c.id, addressConfirmed: true }).expect(200);
    await act(r.delivery.id, { action: 'confirm' }).expect(200);
    await act(r.delivery.id, { action: 'picked_up' }).expect(200);
    await act(r.delivery.id, { action: 'not_delivered', failReason: 'customer_absent' }).expect(200);
    const ret = await act(r.delivery.id, { action: 'return_confirmed' });
    const order = await orderRow(ctx, r.orderId);
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id));
    log('J> return_confirmed pela operação', ret.status, 'pedido', order.status, 'estornado', refunds.reduce((s, x) => s + x.amountCents, 0), 'de', r.attempt.amountCents);
  });

  it('K. SEC-134 com loja diferente e mesmo valor; webhook fora de ordem', async () => {
    const r = await paidOrder(3_000);
    const other = await shopWith(ctx, [{ name: 'X', priceCents: 1_000, stock: 1 }]);
    const r1 = await (async () => { const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }]); const buyer = await customerAt(ctx, shop.origin); await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200); const res = await placeOrder(ctx, buyer.user, buyer.addressId); return { orderId: res.body.id as string, total: (await attemptOf(ctx, res.body.id)).amountCents }; })();
    const forged = await payments.createPayment({ externalReference: r1.orderId, storeId: other.store.id, amountCents: r1.total, applicationFeeCents: 0, method: 'pix' });
    await ctx.http.post(`/v1/dev/payments/${forged.id}/approve`).set(bearer(r.buyer.user.accessToken)).send({}).expect(200);
    await payments.reconcile(new Date());
    const fRow = (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, forged.id)))[0]!;
    log('K> intents', (await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, forged.id))).map((i) => [i.status, i.lastErrorCode, i.failures]), 'provedor refunded', (await fake.getPayment(forged.providerPaymentId!))?.refundedCents);
    log('K> tentativa de outra loja, mesmo valor: pedido', (await orderRow(ctx, r1.orderId)).status, 'tentativa', fRow.status, 'alertas', (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.attemptId, forged.id))).map((a) => a.kind), 'estornos', (await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, forged.id))).length); void r;
    // fora de ordem: estornado e depois chega "approved" de novo
    const r2 = await paidOrder(3_000);
    await adminRefund(superAdmin.accessToken, r2.orderId, r2.attempt.amountCents).expect(200);
    const n = fake.signedNotification(r2.attempt.providerPaymentId!, 'payment.updated');
    await ctx.http.post('/v1/webhooks/fake').query(n.query).set(n.headers).send(n.body);
    await ctx.http.post('/v1/webhooks/fake').query(n.query).set(n.headers).send(n.body);
    await payments.reconcile(new Date());
    const att = (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, r2.attempt.id)))[0]!;
    const o2 = await orderRow(ctx, r2.orderId);
    const al = await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.attemptId, r2.attempt.id));
    log('K> após estorno total + webhook repetido: tentativa', att.status, 'pedido', o2.status, 'alertas', al.map((a) => a.kind));
    void orders;
  });
  });

  it('L. SEC-131: 6 criações concorrentes da mesma conta (carrinhos idênticos)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 2_000, stock: 200 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 50).expect(200);
    const rev = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body.revision;
    const res = await Promise.all([1, 2, 3, 4, 5, 6].map(() => ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'delivery', addressId: buyer.addressId, cartRevision: rev, paymentMethod: 'pix' })));
    const pend = await ctx.db.select().from(orders).where(eq(orders.userId, buyer.user.userId));
    log('L>', res.map((x) => `${x.status}:${x.body.code ?? ''}`), 'pedidos', pend.length);
  });
});
