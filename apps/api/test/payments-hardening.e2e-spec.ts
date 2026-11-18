import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { ProviderTimeoutError } from '../src/modules/payments/payment-provider.js';
import { auditLog, paymentAlerts, paymentAttempts, paymentRefundIntents, paymentRefunds, webhookEvents } from '../src/platform/database/schema.js';
import { DRIZZLE } from '../src/platform/database/database.module.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureLegalDocs, registerUser } from './helpers/fixtures.js';

/** Endurecimento de pagamentos pedido no review da Onda 1: I2, I3, I4, I5, I6. */
describe('Pagamentos: endurecimento (review I2-I6)', () => {
  let ctx: TestContext;
  let payments: PaymentsService;
  let fake: FakePaymentProvider;
  let user: Awaited<ReturnType<typeof registerUser>>;
  const storeId = randomUUID();
  const ctxless = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };

  const create = async (over: Record<string, unknown> = {}) =>
    (await ctx.http.post('/v1/dev/payments').set(bearer(user.accessToken)).send({ amountCents: 5000, method: 'pix', storeId, applicationFeeCents: 500, externalReference: `order-${randomUUID()}`, ...over }).expect(201)).body as { id: string };
  const row = async (id: string) => (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id)))[0]!;
  const approve = (id: string) => ctx.http.post(`/v1/dev/payments/${id}/approve`).set(bearer(user.accessToken)).send({}).expect(200);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    payments = ctx.app.get(PaymentsService);
    fake = ctx.app.get(FakePaymentProvider);
    user = await registerUser(ctx);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });
  afterEach(() => vi.restoreAllMocks());

  it('I2: falha ao gravar o evento NÃO marca o antirreplay; a reentrega com o mesmo x-request-id processa', async () => {
    const pix = await create();
    const pid = (await row(pix.id)).providerPaymentId!;
    await fake.simulate(pid, { outcome: 'approved' });
    const n = fake.signedNotification(pid, 'payment.updated');
    const db = ctx.app.get(DRIZZLE) as unknown as { insert: (...a: unknown[]) => unknown };
    const original = db.insert.bind(db);
    let failed = false;
    vi.spyOn(db, 'insert').mockImplementation(((table: unknown) => {
      if (!failed && table === webhookEvents) {
        failed = true;
        throw new Error('banco fora do ar (simulado)');
      }
      return original(table);
    }));
    const send = () => ctx.http.post(`/v1/webhooks/fake?data.id=${pid}&type=payment`).set(n.headers).send({});
    await send().expect(500);
    expect(await ctx.redis.get(`webhook:seen:fake:${n.headers['x-request-id']}`)).toBeNull();
    const retry = await send().expect(200);
    expect(retry.body).toEqual({ received: true, duplicate: false });
    await payments.processDue();
    await payments.drain();
    expect((await row(pix.id)).status).toBe('approved');
    // a 3ª entrega é duplicada
    expect((await send().expect(200)).body.duplicate).toBe(true);
  });

  it('I6: notificação que não é de pagamento (merchant_order) é aceita e ignorada, sem evento nem alerta', async () => {
    const pix = await create();
    const pid = (await row(pix.id)).providerPaymentId!;
    const n = fake.signedNotification(pid, 'merchant_order');
    const res = await ctx.http.post(`/v1/webhooks/fake?data.id=${pid}&type=merchant_order`).set(n.headers).send({}).expect(200);
    expect(res.body.received).toBe(true);
    expect(await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.providerPaymentId, pid))).toHaveLength(0);
  });

  it('I3: a tentativa é gravada ANTES de cobrar; falha ao gravar a resposta deixa `creating` e a conciliação completa com o MESMO attemptId, sem cobrar duas vezes', async () => {
    const createSpy = vi.spyOn(fake, 'createPayment');
    vi.spyOn(payments as unknown as { completeCreation: () => unknown }, 'completeCreation').mockRejectedValueOnce(new Error('banco caiu depois da cobrança'));
    const res = await ctx.http.post('/v1/dev/payments').set(bearer(user.accessToken)).send({ amountCents: 4200, method: 'pix', storeId, externalReference: `order-${randomUUID()}` });
    expect(res.status).toBe(500);
    const [stuck] = (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.amountCents, 4200))).slice(-1);
    expect(stuck?.status).toBe('creating');
    expect(stuck?.providerPaymentId).toBeNull();
    const firstCall = createSpy.mock.calls[0]?.[0];
    expect(firstCall?.attemptId).toBe(stuck?.id);

    vi.restoreAllMocks();
    const second = vi.spyOn(fake, 'createPayment');
    await payments.reconcile(new Date(Date.now() + 10 * 60_000));
    expect(second.mock.calls[0]?.[0].attemptId).toBe(stuck?.id); // mesma chave de idempotência
    const after = await row(stuck!.id);
    expect(after.status).toBe('pending');
    expect(after.providerPaymentId).toMatch(/^fk/);
    // o provedor deduplicou: o pagamento do provedor é o mesmo da primeira chamada
    const remote = await fake.getPayment(after.providerPaymentId!);
    expect(remote?.amountCents).toBe(4200);
  });

  it('I3: erro definitivo do provedor cancela a tentativa gravada (nada fica `creating`)', async () => {
    vi.spyOn(fake, 'createPayment').mockRejectedValueOnce(new Error('provedor recusou'));
    await ctx.http.post('/v1/dev/payments').set(bearer(user.accessToken)).send({ amountCents: 4300, method: 'pix', storeId, externalReference: `order-${randomUUID()}` }).expect(500);
    const [attempt] = (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.amountCents, 4300))).slice(-1);
    expect(attempt).toMatchObject({ status: 'cancelled', declineReason: 'provider_error' });
  });

  describe('estorno (I4)', () => {
    it('mesma chave com valor diferente é 422 e não estorna; mesma chave e valor não estorna de novo (o fake honra a chave)', async () => {
      const pix = await create({ amountCents: 10_000 });
      await approve(pix.id);
      const refundSpy = vi.spyOn(fake, 'refund');
      await payments.refund(pix.id, 3000, 'x', 'dup-1', ctxless);
      await expect(payments.refund(pix.id, 3500, 'x', 'dup-1', ctxless)).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 422 });
      await payments.refund(pix.id, 3000, 'x', 'dup-1', ctxless);
      expect(refundSpy).toHaveBeenCalledTimes(1);
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, pix.id))).toHaveLength(1);
      // o provedor, chamado de novo com a mesma chave, devolve o mesmo estorno
      const pid = (await row(pix.id)).providerPaymentId!;
      const a = await fake.refund(pid, 3000, "dup-1");
      const b = await fake.refund(pid, 3000, "dup-1");
      expect(a.providerRefundId).toBe(b.providerRefundId);
      expect((await fake.getPayment(pid))?.refundedCents).toBe(3000);
    });

    it('falha definitiva do provedor não grava estorno e libera o valor reservado; a auditoria nasce junto do estorno', async () => {
      const pix = await create({ amountCents: 10_000 });
      await approve(pix.id);
      vi.spyOn(fake, 'refund').mockRejectedValueOnce(new Error('provedor recusou o estorno'));
      await expect(payments.refund(pix.id, 6000, 'a', 'f-1', ctxless)).rejects.toThrow('provedor recusou');
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, pix.id))).toHaveLength(0);
      const [intent] = await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, pix.id));
      expect(intent?.status).toBe('failed');
      expect(await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, pix.id))).toHaveLength(0);
      // o valor foi liberado: um estorno de 6000 agora passa e é auditado
      await payments.refund(pix.id, 6000, 'b', 'f-2', ctxless);
      expect(await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, pix.id))).toHaveLength(1);
    });

    it('timeout do provedor mantém a intenção `pending` (reserva o valor) e a conciliação repete com a mesma chave', async () => {
      const pix = await create({ amountCents: 10_000 });
      await approve(pix.id);
      vi.spyOn(fake, 'refund').mockRejectedValueOnce(new ProviderTimeoutError());
      await expect(payments.refund(pix.id, 6000, 'a', 't-1', ctxless)).rejects.toMatchObject({ name: 'ProviderTimeoutError' });
      const [intent] = await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, pix.id));
      expect(intent?.status).toBe('pending');
      // enquanto pendente, o valor está reservado: outro estorno que estoure o total é recusado
      await expect(payments.refund(pix.id, 6000, 'b', 't-2', ctxless)).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_PAID' });

      vi.restoreAllMocks();
      await payments.reconcile(new Date(Date.now() + 10 * 60_000));
      const [done] = await ctx.db.select().from(paymentRefundIntents).where(eq(paymentRefundIntents.attemptId, pix.id));
      expect(done?.status).toBe('done');
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, pix.id))).toHaveLength(1);
    });
  });

  it('I5: erro do provedor em UM pagamento não aborta a conciliação; os demais são conciliados e a falha é contada', async () => {
    const a = await create();
    const b = await create();
    const c = await create();
    const pidB = (await row(b.id)).providerPaymentId!;
    const pidC = (await row(c.id)).providerPaymentId!;
    await fake.simulate(pidC, { outcome: 'approved' }); // pago, webhook perdido
    const original = fake.getPayment.bind(fake);
    vi.spyOn(fake, 'getPayment').mockImplementation(async (id: string) => {
      if (id === pidB) throw new Error('provedor falhou neste');
      return original(id);
    });
    const result = await payments.reconcile(new Date(Date.now() + 20 * 60_000));
    expect(result.failures).toBeGreaterThanOrEqual(1);
    expect((await row(c.id)).status).toBe('approved');
    expect((await row(a.id)).status).toBe('expired'); // vencido e ainda pendente no provedor
  });

  it('I5: só uma instância concilia por vez (advisory lock)', async () => {
    const db = ctx.app.get(DRIZZLE) as unknown as { transaction: (fn: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<unknown>) => Promise<unknown> };
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const holder = db.transaction(async (tx) => {
      const { sql } = await import('drizzle-orm');
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('webag:payments:reconcile'))`);
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const skipped = await payments.reconcile();
    expect(skipped).toMatchObject({ skipped: true, checked: 0 });
    release();
    await holder;
    expect((await payments.reconcile()).skipped).toBeUndefined();
    expect(await ctx.db.select().from(paymentAlerts)).toBeDefined();
  });
});
