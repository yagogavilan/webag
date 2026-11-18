import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { signedWebhookHeaders } from '../src/modules/payments/webhook-signature.js';
import { DEV_FAKE_WEBHOOK_SECRET } from '../src/platform/config/env.js';
import { auditLog, paymentAlerts, paymentAttempts, paymentRefunds, webhookEvents } from '../src/platform/database/schema.js';
import { bearer, createTestApp, listRoutes, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, registerUser, type TestAdmin } from './helpers/fixtures.js';

describe('Pagamentos: PaymentProvider fake, webhook assinado e conciliação (WB-150, WB-153, SEC-030..044)', () => {
  let ctx: TestContext;
  let payments: PaymentsService;
  let fake: FakePaymentProvider;
  let user: Awaited<ReturnType<typeof registerUser>>;
  let finance: TestAdmin;
  let support: TestAdmin;
  const storeId = randomUUID();
  const auth = () => bearer(user.accessToken);

  const createPix = async (over: Record<string, unknown> = {}) =>
    (await ctx.http.post('/v1/dev/payments').set(auth()).send({ amountCents: 5000, method: 'pix', storeId, applicationFeeCents: 500, externalReference: `order-${randomUUID()}`, ...over }).expect(201)).body as {
      id: string; status: string; amount: { amount: number; currency: string }; pixCopyPaste: string | null; expiresAt: string | null;
    };
  const row = async (id: string) => {
    const found = (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id)))[0]!;
    return { ...found, providerPaymentId: found.providerPaymentId as string };
  };
  const alertsOf = (id: string) => ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.attemptId, id));
  const ctxless = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    payments = ctx.app.get(PaymentsService);
    fake = ctx.app.get(FakePaymentProvider);
    user = await registerUser(ctx);
    finance = await createAdmin(ctx, 'finance');
    support = await createAdmin(ctx, 'support');
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('criação (WB-150 C1/C3, SEC-030)', () => {
    it('PIX falso devolve copia e cola, validade de 15 min e valores em centavos inteiros', async () => {
      const pix = await createPix();
      expect(pix.status).toBe('pending');
      expect(pix.pixCopyPaste).toMatch(/^000201/);
      expect(pix.amount).toEqual({ amount: 5000, currency: 'BRL' });
      const minutes = (new Date(pix.expiresAt!).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(14.5);
      expect(minutes).toBeLessThanOrEqual(15);
      expect(Number.isInteger(pix.amount.amount)).toBe(true);
    });

    it('cartão de teste: 0000 aprova, 0001 recusa por saldo, 0002 pede 3DS, 0003 dá timeout e deixa a tentativa em `creating` para a conciliação', async () => {
      const card = (token: string, extra: Record<string, unknown> = {}) =>
        ctx.http.post('/v1/dev/payments').set(auth()).send({ amountCents: 9000, method: 'card', storeId, cardToken: token, ...extra });
      expect((await card('tok_0000').expect(201)).body.status).toBe('approved');
      const declined = (await card('tok_0001').expect(201)).body;
      expect(declined).toMatchObject({ status: 'declined', declineReason: 'insufficient_funds' });
      const threeDs = (await card('tok_0002').expect(201)).body;
      expect(threeDs.status).toBe('pending_3ds');
      expect((await card('tok_9999').expect(201)).body.declineReason).toBe('invalid_card');

      const before = (await ctx.db.select().from(paymentAttempts)).length;
      const timeout = await card('tok_0003').expect(504);
      expect(timeout.body.code).toBe('PROVIDER_TIMEOUT');
      // review I3: a tentativa é gravada antes de cobrar; no timeout ela fica `creating` (a conciliação resolve)
      expect((await ctx.db.select().from(paymentAttempts)).length).toBe(before + 1);
      expect((await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.status, 'creating'))).length).toBeGreaterThanOrEqual(1);

      // 3DS pendente termina aprovado pelo mesmo caminho do webhook
      const approved = await ctx.http.post(`/v1/dev/payments/${threeDs.id}/approve`).set(auth()).send({}).expect(200);
      expect(approved.body.payment.status).toBe('approved');
    });

    it('valida entrada: valor inteiro e positivo, limite por pedido, parcelas, token de cartão e campos desconhecidos', async () => {
      const post = (body: Record<string, unknown>) => ctx.http.post('/v1/dev/payments').set(auth()).send({ method: 'pix', storeId, ...body });
      await post({ amountCents: 0 }).expect(400);
      await post({ amountCents: 10.5 }).expect(400);
      await post({ amountCents: 1000, status: 'approved' }).expect(400);
      await post({ amountCents: 1000, total: 1 }).expect(400);
      const above = await post({ amountCents: 200_001 }).expect(422);
      expect(above.body.code).toBe('ORDER_ABOVE_LIMIT');
      await post({ amountCents: 9000, method: 'card' }).expect(400); // sem token
      const tooMany = await post({ amountCents: 90_000, method: 'card', cardToken: 'tok_0000', installments: 4 }).expect(422);
      expect(tooMany.body.code).toBe('INSTALLMENTS_NOT_ALLOWED');
      await post({ amountCents: 5000, method: 'card', cardToken: 'tok_0000', installments: 3 }).expect(422); // parcela abaixo de R$ 30
      await post({ amountCents: 9000, method: 'card', cardToken: 'tok_0000', installments: 3 }).expect(201);
      await ctx.http.post('/v1/dev/payments').send({ amountCents: 1000, method: 'pix' }).expect(401);
    });

    it('método desligado pela feature flag → 409 (WB-120 C2)', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      await ctx.http.put('/v1/admin/feature-flags/pix').set(bearer(admin.accessToken)).send({ enabled: false }).expect(200);
      try {
        const res = await ctx.http.post('/v1/dev/payments').set(auth()).send({ amountCents: 1000, method: 'pix' }).expect(409);
        expect(res.body.code).toBe('PAYMENT_METHOD_DISABLED');
      } finally {
        await ctx.http.put('/v1/admin/feature-flags/pix').set(bearer(admin.accessToken)).send({ enabled: true }).expect(200);
      }
    });
  });

  describe('webhook assinado (WB-153, SEC-032, SEC-033)', () => {
    const post = (provider: string, query: string, headers: Record<string, string>) => {
      let req = ctx.http.post(`/v1/webhooks/${provider}?${query}`);
      for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
      return req.send({ type: 'payment', data: { id: 'ignorado' } });
    };
    const providerId = async (id: string) => (await row(id)).providerPaymentId;

    it('aprova pelo caminho real: webhook → re-consulta ao provedor → estado muda; resposta 200 rápida', async () => {
      const pix = await createPix();
      const pid = await providerId(pix.id);
      await fake.simulate(pid, { outcome: 'approved' });
      const n = fake.signedNotification(pid, 'payment.updated');
      const start = performance.now();
      const res = await post('fake', `data.id=${pid}&type=payment`, n.headers).expect(200);
      expect(performance.now() - start).toBeLessThan(2000);
      expect(res.body).toEqual({ received: true, duplicate: false });
      await payments.processDue();
      await payments.drain();
      expect((await row(pix.id)).status).toBe('approved');
    });

    it('SEC-033: a mesma notificação 2 vezes gera 1 evento e 1 efeito', async () => {
      const pix = await createPix();
      const pid = await providerId(pix.id);
      const n = fake.signedNotification(pid, 'payment.updated');
      expect((await post('fake', `data.id=${pid}&type=payment`, n.headers).expect(200)).body.duplicate).toBe(false);
      const second = await post('fake', `data.id=${pid}&type=payment`, n.headers).expect(200);
      expect(second.body.duplicate).toBe(true);
      expect(await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.providerPaymentId, pid))).toHaveLength(1);
      // mesmo sem o Redis de antirreplay, a unicidade do banco segura (x-request-id repetido)
      await ctx.redis.del(`webhook:seen:fake:${n.headers['x-request-id']}`);
      expect((await post('fake', `data.id=${pid}&type=payment`, n.headers).expect(200)).body.duplicate).toBe(true);
      expect(await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.providerPaymentId, pid))).toHaveLength(1);
    });

    it('SEC-032: assinatura errada, ts de 10 min atrás, sem assinatura (IPN legado) → 401 sem enfileirar', async () => {
      const pix = await createPix();
      const pid = await providerId(pix.id);
      const good = signedWebhookHeaders(DEV_FAKE_WEBHOOK_SECRET, pid, randomUUID());
      const forged = signedWebhookHeaders('segredo-errado-qualquer', pid, randomUUID());
      const stale = signedWebhookHeaders(DEV_FAKE_WEBHOOK_SECRET, pid, randomUUID(), Date.now() - 10 * 60_000);
      await post('fake', `data.id=${pid}&type=payment`, forged).expect(401);
      await post('fake', `data.id=${pid}&type=payment`, stale).expect(401);
      await post('fake', `topic=payment&id=${pid}`, {}).expect(401); // IPN legado
      // assinatura de OUTRO pagamento não serve para este data.id
      const other = signedWebhookHeaders(DEV_FAKE_WEBHOOK_SECRET, 'fkoutroid', randomUUID());
      await post('fake', `data.id=${pid}&type=payment`, other).expect(401);
      expect(await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.providerPaymentId, pid))).toHaveLength(0);
      await post('fake', `data.id=${pid}&type=payment`, good).expect(200);
    });

    it('SEC-032: só vale o data.id da QUERY; o do corpo é ignorado', async () => {
      const a = await createPix();
      const b = await createPix();
      const [pa, pb] = [await providerId(a.id), await providerId(b.id)];
      await fake.simulate(pb, { outcome: 'approved' }); // só o B foi pago no provedor
      const forB = signedWebhookHeaders(DEV_FAKE_WEBHOOK_SECRET, pa, randomUUID());
      // assinatura e query de A; corpo mente dizendo que é o B
      await ctx.http.post(`/v1/webhooks/fake?data.id=${pa}&type=payment`).set(forB).send({ type: 'payment', data: { id: pb } }).expect(200);
      await payments.processDue();
      await payments.drain();
      expect((await row(a.id)).status).toBe('pending');
      expect((await row(b.id)).status).toBe('pending');
    });

    it('provedor da URL diferente do configurado → 404', async () => {
      await post('mercadopago', 'data.id=x', signedWebhookHeaders(DEV_FAKE_WEBHOOK_SECRET, 'x', randomUUID())).expect(404);
    });

    it('evento fora de ordem não volta o estado: aprovação chegando depois do estorno é ignorada', async () => {
      const pix = await createPix();
      const pid = await providerId(pix.id);
      await ctx.http.post(`/v1/dev/payments/${pix.id}/approve`).set(auth()).send({}).expect(200);
      expect((await row(pix.id)).status).toBe('approved');

      await payments.refund(pix.id, 5000, 'cliente desistiu', 'k-full-1', ctxless);
      expect((await row(pix.id)).status).toBe('refunded');
      await fake.simulate(pid, { outcome: 'approved' });
      await payments.receiveWebhook(fake.signedNotification(pid, 'payment.updated'));
      await payments.processDue();
      await payments.drain();
      expect((await row(pix.id)).status).toBe('refunded');
    });
  });

  describe('conferência contra o provedor (SEC-034)', () => {
    it.each([
      ['valor R$ 0,01 menor', { reportedAmountCents: 4999 }, 'amount'],
      ['referência de outro pedido', { reportedReference: 'order-de-outro' }, 'external_reference'],
      ['recebedor diferente da loja', { reportedReceiverId: 'fake-seller-outra-loja' }, 'receiver'],
      ['comissão diferente', { reportedFeeCents: 1 }, 'application_fee'],
    ])('aprovação com %s NÃO aprova: vira divergente e gera alerta', async (_name, injected, field) => {
      const pix = await createPix();
      const res = await ctx.http.post(`/v1/dev/payments/${pix.id}/approve`).set(auth()).send(injected).expect(200);
      expect(res.body.payment.status).toBe('divergent');
      const alerts = await alertsOf(pix.id);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ kind: 'conciliation_mismatch' });
      expect((alerts[0]?.details as { mismatches: string[] }).mismatches).toContain(field);

      const list = await ctx.http.get('/v1/admin/payments/alerts').query({ openOnly: 'true' }).set(bearer(finance.accessToken)).expect(200);
      expect((list.body.data as { attemptId: string }[]).some((a) => a.attemptId === pix.id)).toBe(true);
    });

    it('ID desconhecido: descarta o evento e alerta; só financeiro e super admin veem os alertas', async () => {
      const unknown = `fk${'ab'.repeat(12)}`;
      await payments.receiveWebhook(fake.signedNotification(unknown, 'payment.updated'));
      await payments.processDue();
      await payments.drain();
      const [event] = await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.providerPaymentId, unknown));
      expect(event?.status).toBe('discarded');
      const list = await ctx.http.get('/v1/admin/payments/alerts').set(bearer(finance.accessToken)).expect(200);
      expect(JSON.stringify(list.body)).toContain(unknown);
      await ctx.http.get('/v1/admin/payments/alerts').set(bearer(support.accessToken)).expect(403);
    });

    it('SEC-040: PIX pago depois de expirado gera 1 estorno total automático e idempotente', async () => {
      const pix = await createPix();
      await ctx.http.post(`/v1/dev/payments/${pix.id}/expire`).set(auth()).send().expect(200);
      expect((await row(pix.id)).status).toBe('expired');
      const late = await ctx.http.post(`/v1/dev/payments/${pix.id}/approve`).set(auth()).send({}).expect(200);
      expect(late.body.payment.status).toBe('refunded');
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, pix.id))).toHaveLength(1);
      // o provedor repete o evento: nada de segundo estorno
      await ctx.http.post(`/v1/dev/payments/${pix.id}/approve`).set(auth()).send({}).expect(200);
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, pix.id))).toHaveLength(1);
      expect((await alertsOf(pix.id)).some((a) => a.kind === 'late_payment_refunded')).toBe(true);
    });
  });

  describe('retentativa e reprocessamento (WB-153 C3/C4)', () => {
    it('falha do provedor retenta com espera exponencial; esgotadas as tentativas vai a "falhas" com alerta; reprocessar funciona e audita', async () => {
      const pix = await createPix();
      const pid = (await row(pix.id)).providerPaymentId;
      await fake.simulate(pid, { outcome: 'approved' });
      const spy = vi.spyOn(fake, 'getPayment').mockRejectedValue(new Error('provedor fora do ar'));
      try {
        await payments.receiveWebhook(fake.signedNotification(pid, 'payment.updated'));
        await payments.processDue();
        await payments.drain();
        const [event] = await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.providerPaymentId, pid));
        expect(event).toMatchObject({ status: 'pending', attempts: 1, lastError: 'provedor fora do ar' });
        expect(event!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
        expect((await row(pix.id)).status).toBe('pending');

        // 7 tentativas já feitas: a próxima falha é a última
        await ctx.db.update(webhookEvents).set({ attempts: 7, nextAttemptAt: new Date() }).where(eq(webhookEvents.id, event!.id));
        await payments.processDue();
        await payments.drain();
        const [dead] = await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.id, event!.id));
        expect(dead?.status).toBe('failed');
        expect((await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'webhook_failed'))).length).toBeGreaterThan(0);
      } finally {
        spy.mockRestore();
      }
      const [failed] = await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.providerPaymentId, pid));
      await ctx.http.post(`/v1/admin/payments/webhook-events/${failed!.id}/reprocess`).set(bearer(support.accessToken)).expect(403);
      await ctx.http.post(`/v1/admin/payments/webhook-events/${failed!.id}/reprocess`).set(bearer(finance.accessToken)).expect(204);
      expect((await row(pix.id)).status).toBe('approved');
      const logs = await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'payment.webhook_reprocess'), eq(auditLog.targetId, String(failed!.id))));
      expect(logs).toHaveLength(1);
    });
  });

  describe('conciliação periódica (SEC-042)', () => {
    it('pega pagamento aprovado sem webhook (perdido) e expira PIX vencido', async () => {
      const missed = await createPix();
      const expired = await createPix();
      await fake.simulate((await row(missed.id)).providerPaymentId, { outcome: 'approved' }); // pago, mas o webhook se perdeu
      const old = new Date(Date.now() - 10 * 60_000);
      await ctx.db.update(paymentAttempts).set({ createdAt: old }).where(eq(paymentAttempts.id, missed.id));
      await ctx.db.update(paymentAttempts).set({ createdAt: old, expiresAt: new Date(Date.now() - 60_000) }).where(eq(paymentAttempts.id, expired.id));

      const result = await payments.reconcile();
      expect(result.synced).toBeGreaterThanOrEqual(2);
      expect((await row(missed.id)).status).toBe('approved');
      expect((await row(expired.id)).status).toBe('expired');
    });

    it('divergência injetada em pagamento aprovado vira alerta (WB-113)', async () => {
      const pix = await createPix();
      const pid = (await row(pix.id)).providerPaymentId;
      await ctx.http.post(`/v1/dev/payments/${pix.id}/approve`).set(auth()).send({}).expect(200);
      expect((await row(pix.id)).status).toBe('approved');
      await fake.simulate(pid, { outcome: 'approved', reportedAmountCents: 4000 });
      const result = await payments.reconcile();
      expect(result.alerts).toBeGreaterThanOrEqual(1);
      expect((await alertsOf(pix.id)).some((a) => a.kind === 'conciliation_mismatch')).toBe(true);
      expect((await row(pix.id)).status).toBe('approved'); // não regride; só alerta
    });
  });

  describe('estorno (SEC-031, SEC-039 na parte de dados)', () => {
    it('parcial e total, ao meio original; soma nunca passa do pago; mesma chave não estorna de novo', async () => {
      const pix = await createPix({ amountCents: 10_000 });
      await ctx.http.post(`/v1/dev/payments/${pix.id}/approve`).set(auth()).send({}).expect(200);
      await payments.refund(pix.id, 3000, 'item indisponível', 'k-1', ctxless);
      await payments.refund(pix.id, 3000, 'item indisponível', 'k-1', ctxless); // repetição: sem efeito
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, pix.id))).toHaveLength(1);
      expect((await row(pix.id)).status).toBe('approved');
      await expect(payments.refund(pix.id, 7001, 'a mais', 'k-2', ctxless)).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_PAID' });
      await payments.refund(pix.id, 7000, 'restante', 'k-3', ctxless);
      expect((await row(pix.id)).status).toBe('refunded');
      await expect(payments.refund(pix.id, 1, 'extra', 'k-4', ctxless)).rejects.toMatchObject({ code: 'PAYMENT_NOT_REFUNDABLE' });
    });

    it('dois estornos parciais concorrentes que somam mais que o pago: um falha', async () => {
      const pix = await createPix({ amountCents: 10_000 });
      await ctx.http.post(`/v1/dev/payments/${pix.id}/approve`).set(auth()).send({}).expect(200);
      const results = await Promise.allSettled([
        payments.refund(pix.id, 6000, 'a', 'c-1', ctxless),
        payments.refund(pix.id, 6000, 'b', 'c-2', ctxless),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, pix.id));
      expect(refunds.reduce((sum, r) => sum + r.amountCents, 0)).toBeLessThanOrEqual(10_000);
    });

    it('estorno de pagamento não aprovado é recusado', async () => {
      const pix = await createPix();
      await expect(payments.refund(pix.id, 100, 'x', 'n-1', ctxless)).rejects.toMatchObject({ code: 'PAYMENT_NOT_REFUNDABLE' });
    });
  });

  describe('invariantes de segurança', () => {
    it('SEC-044 / regra inviolável: nenhuma coluna guarda cartão, CPF ou documento do pagador', async () => {
      const columns = await ctx.pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name in ('payment_attempts','payment_refunds','webhook_events','payment_alerts')`,
      );
      const names = columns.rows.map((r) => r.column_name);
      expect(names.length).toBeGreaterThan(20);
      expect(names.filter((n) => /cpf|cnpj|document|pan|cvv|card_number|holder|identification/i.test(n))).toEqual([]);
    });

    it('SEC-035: nenhuma rota fora de /v1/dev confirma, aprova ou recusa pagamento', () => {
      const risky = listRoutes(ctx.app).filter((r) => /confirm|approve|decline|capture/i.test(r.path) && !r.path.startsWith('/v1/dev/') && !r.path.startsWith('/v1/admin/totp'));
      expect(risky).toEqual([]);
    });

    it('a resposta de pagamento não expõe ID do provedor nem dados internos', async () => {
      const pix = await createPix();
      expect(Object.keys(pix).sort()).toEqual(['amount', 'applicationFee', 'createdAt', 'declineReason', 'expiresAt', 'id', 'installments', 'method', 'pixCopyPaste', 'status']);
    });
  });
});
