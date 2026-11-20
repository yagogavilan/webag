import { randomUUID } from 'node:crypto';
import { and, eq, like } from 'drizzle-orm';
import { DsrService } from '../src/modules/privacy/dsr.service.js';
import { RetentionService } from '../src/modules/privacy/retention.service.js';
import { accessLog, authCodes, userStatusHistory, exchangeRequests, mediaAssets, orderItems, orders, paymentAlerts, privacyRequests, retentionRuns, sessions, storeDocuments, stores, webhookEvents } from '../src/platform/database/schema.js';
import { createTestApp, bearer, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, expireReauth, insertStoreRow, memoryStorage, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

const DAY = 86_400_000;

describe('Pedidos de titulares (WB-217) e retenção (WB-215, DT-021)', () => {
  let ctx: TestContext;
  let dsr: DsrService;
  let retention: RetentionService;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    dsr = ctx.app.get(DsrService);
    retention = ctx.app.get(RetentionService);
    superAdmin = await createAdmin(ctx, 'super_admin');
    ops = await createAdmin(ctx, 'operations');
  });
  afterAll(() => ctx.close());

  const submit = (body: Record<string, unknown>, ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7`) => ctx.http.post('/v1/privacy/requests').set('X-Forwarded-For', ip).send(body);
  const sa = (path: string) => ctx.http.get(`/v1/admin/privacy-requests${path}`).set(bearer(superAdmin.accessToken));

  describe('pedidos de titulares', () => {
    it('formulário público: resposta idêntica exista ou não conta, protocolo, prazo de 15 dias, e-mail de confirmação e limites', async () => {
      const user = await createCustomer(ctx);
      ctx.mail.outbox.length = 0;
      const known = await submit({ type: 'access', email: user.email, message: 'Quero saber o que vocês têm de mim' }).expect(202);
      const ghostEmail = `ninguem-${randomUUID().slice(0, 8)}@teste.webag.local`;
      const ghost = await submit({ type: 'access', email: ghostEmail }).expect(202);
      expect(Object.keys(known.body).sort()).toEqual(Object.keys(ghost.body).sort());
      expect(known.body.protocol).toMatch(/^PV-\d{4,}$/);
      expect(ghost.body.protocol).not.toBe(known.body.protocol);
      const days = (new Date(known.body.dueAt as string).getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(14.9);
      expect(days).toBeLessThanOrEqual(15);
      expect(ctx.mail.to(user.email).at(-1)!.subject).toContain(known.body.protocol);
      expect(ctx.mail.to(ghostEmail)).toHaveLength(1);

      await submit({ type: 'nao-existe', email: user.email }).expect(400);
      await submit({ type: 'other', email: user.email, message: 'x'.repeat(1001) }).expect(400);
      await submit({ type: 'other', email: 'nao-e-email' }).expect(400);
      // 3 por dia por e-mail (os dois acima de validação não contam: falham antes).
      await submit({ type: 'other', email: user.email }).expect(202);
      await submit({ type: 'other', email: user.email }).expect(202);
      await submit({ type: 'other', email: user.email }).expect(429);
      // 5 por hora por IP.
      const ip = '10.77.1.1';
      for (let i = 0; i < 5; i += 1) await submit({ type: 'other', email: `a${i}-${randomUUID().slice(0, 6)}@teste.webag.local` }, ip).expect(202);
      await submit({ type: 'other', email: `z-${randomUUID().slice(0, 6)}@teste.webag.local` }, ip).expect(429);
    });

    it('só o super admin lê; lista com e-mail mascarado, prazo mais curto no topo e atrasadas; detalhe com histórico', async () => {
      await ctx.http.get('/v1/admin/privacy-requests').expect(401);
      await ctx.http.get('/v1/admin/privacy-requests').set(bearer(ops.accessToken)).expect(403);
      const customer = await createCustomer(ctx);
      await ctx.http.get('/v1/admin/privacy-requests').set(bearer(customer.accessToken)).expect(403);

      const email = `titular-${randomUUID().slice(0, 8)}@teste.webag.local`;
      const recent = (await submit({ type: 'deletion', email }).expect(202)).body as { protocol: string };
      const old = (await ctx.http.post('/v1/admin/privacy-requests').set(bearer(superAdmin.accessToken)).send({ type: 'portability', email: `velho-${randomUUID().slice(0, 8)}@teste.webag.local`, message: 'por e-mail', receivedAt: new Date(Date.now() - 20 * DAY).toISOString() }).expect(201)).body;
      expect(old).toMatchObject({ channel: 'email', status: 'new', overdue: true });
      expect(old.daysLeft).toBeLessThanOrEqual(-4);

      const list = (await sa('').expect(200)).body as { data: { id: string; protocol: string; requester: string; overdue: boolean }[]; nextCursor: string | null };
      const rows = list.data;
      expect(rows[0]!.id).toBe(old.id); // o prazo mais curto (vencido) vem primeiro
      const mine = rows.find((r) => r.protocol === recent.protocol)!;
      expect(mine.requester).toBe(`${email[0]}***@teste.webag.local`);
      expect(JSON.stringify(list)).not.toContain(email);
      expect((await sa('?overdue=true').expect(200)).body.data.every((r: { overdue: boolean }) => r.overdue)).toBe(true);
      expect((await sa('?status=answered').expect(200)).body.data).toEqual([]);
      const page = (await sa('?limit=1').expect(200)).body;
      expect(page.data).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
      expect((await sa(`?limit=1&cursor=${page.nextCursor}`).expect(200)).body.data[0].id).not.toBe(page.data[0].id);

      const detail = (await sa(`/${mine.id}`).expect(200)).body;
      expect(detail).toMatchObject({ protocol: recent.protocol, status: 'new', hasAccount: false });
      expect(detail.history[0]).toMatchObject({ action: 'opened' });
      expect(JSON.stringify(detail)).not.toContain(email);
      await sa('/nao-uuid').expect(404);
      await sa(`/${randomUUID()}`).expect(404);
    });

    it('revelar exige reautenticação e motivo, grava auditoria e histórico; responder avisa o titular e fecha (uma vez só)', async () => {
      const email = `titular-${randomUUID().slice(0, 8)}@teste.webag.local`;
      await submit({ type: 'correction', email, message: 'Meu nome está errado' }).expect(202);
      const id = (await ctx.db.select().from(privacyRequests).where(eq(privacyRequests.requesterEmail, email)))[0]!.id;
      const reveal = (body: Record<string, unknown>) => ctx.http.post(`/v1/admin/privacy-requests/${id}/reveal`).set(bearer(superAdmin.accessToken)).send(body);

      await expireReauth(ctx, superAdmin.userId);
      expect((await reveal({ reason: 'Conferir quem pediu a correção' })).body.code).toBe('REAUTH_REQUIRED');
      await ctx.http.post('/v1/auth/reauth').set(bearer(superAdmin.accessToken)).send({ totpCode: (await import('./helpers/app.js')).totpAt(superAdmin.totpSecret!, 1) }).expect(204);
      await reveal({ reason: 'curto' }).expect(400);
      const shown = (await reveal({ reason: 'Conferir quem pediu a correção' }).expect(200)).body;
      expect(shown).toMatchObject({ email, message: 'Meu nome está errado' });
      const audit = (await ctx.http.get('/v1/admin/audit-log?action=privacy.request_revealed').set(bearer(superAdmin.accessToken)).expect(200)).body.data as { targetId: string; reason: string }[];
      expect(audit.some((a) => a.targetId === id && a.reason === 'Conferir quem pediu a correção')).toBe(true);

      await ctx.http.post(`/v1/admin/privacy-requests/${id}/in-progress`).set(bearer(ops.accessToken)).expect(403);
      expect((await ctx.http.post(`/v1/admin/privacy-requests/${id}/in-progress`).set(bearer(superAdmin.accessToken)).expect(200)).body.status).toBe('in_progress');
      expect((await ctx.http.post(`/v1/admin/privacy-requests/${id}/in-progress`).set(bearer(superAdmin.accessToken))).status).toBe(409);

      ctx.mail.outbox.length = 0;
      await ctx.http.post(`/v1/admin/privacy-requests/${id}/answer`).set(bearer(superAdmin.accessToken)).send({ answer: 'x' }).expect(400);
      const answered = (await ctx.http.post(`/v1/admin/privacy-requests/${id}/answer`).set(bearer(superAdmin.accessToken)).send({ answer: 'Corrigimos o seu nome conforme o pedido.' }).expect(200)).body;
      expect(answered).toMatchObject({ status: 'answered', overdue: false });
      expect(ctx.mail.to(email).at(-1)!.text).toContain('Corrigimos o seu nome');
      expect((await ctx.http.post(`/v1/admin/privacy-requests/${id}/answer`).set(bearer(superAdmin.accessToken)).send({ answer: 'De novo, outra resposta.' })).status).toBe(409);
      const detail = (await sa(`/${id}`).expect(200)).body;
      expect(detail.history.map((h: { action: string }) => h.action)).toEqual(['opened', 'revealed', 'in_progress', 'answered']);
      expect(detail.answer).toBe('Corrigimos o seu nome conforme o pedido.');
    });

    it('alerta aos 10 dias, uma vez só; e a exclusão da conta tira o e-mail e a mensagem do pedido', async () => {
      const user = await registerUser(ctx);
      await submit({ type: 'access', email: user.email, message: 'meu pedido pessoal' }).expect(202);
      const [row] = await ctx.db.select().from(privacyRequests).where(eq(privacyRequests.requesterEmail, user.email));
      expect(row!.userId).toBe(user.userId); // o atendimento vê que há conta
      await dsr.alertDue(); // pedidos antigos de outros testes
      await ctx.db.update(privacyRequests).set({ receivedAt: new Date(Date.now() - 11 * DAY) }).where(eq(privacyRequests.id, row!.id));
      expect(await dsr.alertDue()).toBe(1);
      expect(await dsr.alertDue()).toBe(0);
      const alerts = await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'privacy_request_due'));
      expect(alerts.filter((a) => (a.details as { requestId: string }).requestId === row!.id)).toHaveLength(1);

      await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
      expect((await ctx.db.select().from(privacyRequests).where(eq(privacyRequests.id, row!.id)))[0]).toMatchObject({ requesterEmail: '[anonimizado]', message: null, protocol: row!.protocol });
    });
  });

  describe('retenção (job de expurgo)', () => {
    it('apaga o que venceu (acesso 6 meses, sessões, códigos, webhooks) e mantém o que ainda vale; registra só contagens; idempotente', async () => {
      const user = await createCustomer(ctx);
      const tag = `ret-${randomUUID().slice(0, 8)}`;
      await ctx.db.insert(accessLog).values([
        { userId: user.userId, event: `${tag}-old`, createdAt: new Date(Date.now() - 200 * DAY) },
        { userId: user.userId, event: `${tag}-new`, createdAt: new Date(Date.now() - 30 * DAY) },
      ]);
      const mk = (over: Partial<typeof sessions.$inferInsert>) => ctx.db.insert(sessions).values({ userId: user.userId, absoluteExpiresAt: new Date(Date.now() + DAY), ...over }).returning({ id: sessions.id });
      const [oldRevoked] = await mk({ revokedAt: new Date(Date.now() - 40 * DAY), revokedReason: tag });
      const [oldExpired] = await mk({ absoluteExpiresAt: new Date(Date.now() - 40 * DAY), revokedReason: tag });
      const [recentRevoked] = await mk({ revokedAt: new Date(Date.now() - 2 * DAY), revokedReason: tag });
      const [active] = await mk({ revokedReason: tag });
      await ctx.db.insert(authCodes).values([
        { userId: user.userId, purpose: 'verify_email', codeHash: `${tag}-old`, destinationEmail: user.email, expiresAt: new Date(Date.now() - 9 * DAY), createdAt: new Date(Date.now() - 9 * DAY) },
        { userId: user.userId, purpose: 'verify_email', codeHash: `${tag}-new`, destinationEmail: user.email, expiresAt: new Date(Date.now() + 600_000) },
      ]);
      await ctx.db.insert(webhookEvents).values([
        { provider: 'fake', eventKey: `${tag}-done`, providerPaymentId: 'p1', type: 'payment', status: 'processed', receivedAt: new Date(Date.now() - 100 * DAY) },
        { provider: 'fake', eventKey: `${tag}-pending`, providerPaymentId: 'p2', type: 'payment', status: 'pending', receivedAt: new Date(Date.now() - 100 * DAY) },
        { provider: 'fake', eventKey: `${tag}-recent`, providerPaymentId: 'p3', type: 'payment', status: 'processed', receivedAt: new Date(Date.now() - 5 * DAY) },
      ]);

      const result = await retention.run();
      expect(result.errors).toEqual([]);
      expect(result.counts.accessLog).toBeGreaterThanOrEqual(1);
      expect(result.counts.sessions).toBeGreaterThanOrEqual(2);
      expect(result.counts.webhookEvents).toBeGreaterThanOrEqual(1);

      const events = (await ctx.db.select().from(accessLog).where(like(accessLog.event, `${tag}%`))).map((r) => r.event);
      expect(events).toEqual([`${tag}-new`]);
      const left = (await ctx.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.revokedReason, tag))).map((r) => r.id);
      expect(left.sort()).toEqual([recentRevoked!.id, active!.id].sort());
      expect(left).not.toContain(oldRevoked!.id);
      expect(left).not.toContain(oldExpired!.id);
      expect((await ctx.db.select().from(authCodes).where(like(authCodes.codeHash, `${tag}%`))).map((r) => r.codeHash)).toEqual([`${tag}-new`]);
      expect((await ctx.db.select().from(webhookEvents).where(like(webhookEvents.eventKey, `${tag}%`))).map((r) => r.eventKey).sort()).toEqual([`${tag}-pending`, `${tag}-recent`]);

      // O registro da execução tem só contagens.
      const [run] = await ctx.db.select().from(retentionRuns).where(eq(retentionRuns.id, result.id));
      expect(run!.finishedAt).not.toBeNull();
      expect(JSON.stringify(run!.counts)).not.toContain(user.email);
      // Idempotente e com a trava de 23 h: a 2ª execução do dia não roda.
      expect((await retention.run()).counts.accessLog).toBe(0);
      await ctx.db.delete(retentionRuns);
      expect(await retention.runIfDue()).not.toBeNull();
      expect(await retention.runIfDue()).toBeNull();
      // O acesso do usuário que sobrou é só o recente (a exigência legal de 6 meses).
      expect((await ctx.db.select().from(accessLog).where(and(eq(accessLog.userId, user.userId)))).every((r) => r.createdAt.getTime() > Date.now() - 183 * DAY)).toBe(true);
    });

    it('SEC-185: o histórico de bloqueio some depois de retencao_bloqueio_anos (5); o recente fica; o prazo é parâmetro', async () => {
      const user = await createCustomer(ctx);
      const [old, edge, recent] = await ctx.db
        .insert(userStatusHistory)
        .values([
          { userId: user.userId, action: 'blocked', reason: 'motivo antigo de teste da retenção', createdAt: new Date(Date.now() - 5 * 365.25 * DAY - DAY) },
          { userId: user.userId, action: 'unblocked', reason: 'motivo quase no limite do prazo', createdAt: new Date(Date.now() - 4 * 365.25 * DAY) },
          { userId: user.userId, action: 'blocked', reason: 'motivo recente de teste da retenção', createdAt: new Date(Date.now() - 30 * DAY) },
        ])
        .returning({ id: userStatusHistory.id });
      const result = await retention.run();
      expect(result.errors).toEqual([]);
      expect(result.counts.userStatusHistory).toBeGreaterThanOrEqual(1);
      const left = (await ctx.db.select({ id: userStatusHistory.id }).from(userStatusHistory).where(eq(userStatusHistory.userId, user.userId))).map((r) => r.id).sort();
      expect(left).toEqual([edge!.id, recent!.id].sort());
      expect(left).not.toContain(old!.id);
    });

    it('fotos de troca somem 180 dias depois da troca encerrada; troca em andamento e troca recente mantêm', async () => {
      const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 20 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, created.id));
      const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, created.id));

      const photo = async (status: string, updatedDaysAgo: number) => {
        const key = `exchange/${randomUUID()}.jpg`;
        await memoryStorage(ctx).putObject('private', key, Buffer.from('foto'), 'image/jpeg');
        const [asset] = await ctx.db.insert(mediaAssets).values({ ownerUserId: buyer.user.userId, purpose: 'exchange_photo', status: 'ready', objectKey: key, declaredContentType: 'image/jpeg', declaredSizeBytes: 4, expiresAt: new Date(Date.now() + 1e6) }).returning();
        const [ex] = await ctx.db
          .insert(exchangeRequests)
          .values({ number: `TR-${randomUUID().slice(0, 6).toUpperCase()}`, orderId: created.id, orderItemId: item!.id, userId: buyer.user.userId, storeId: shop.store.id, type: 'defect', method: 'drop_at_store', resolution: 'refund', status: status as 'completed', quantity: 1, photoIds: [asset!.id], answerDeadlineAt: new Date(), windowEndsAt: new Date(), updatedAt: new Date(Date.now() - updatedDaysAgo * DAY) })
          .returning();
        return { key, assetId: asset!.id, exchangeId: ex!.id };
      };
      // Índice parcial: só uma troca ABERTA por item; as encerradas podem coexistir, e a aberta é a última.
      const done = await photo('completed', 200);
      const recent = await photo('rejected', 10);
      const open = await photo('requested', 400);

      const result = await retention.run();
      expect(result.counts.exchangePhotos).toBeGreaterThanOrEqual(1);
      expect(await memoryStorage(ctx).getObject('private', done.key, { maxBytes: 100 })).toBeNull();
      expect((await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, done.exchangeId)))[0]!.photoIds).toEqual([]);
      expect(await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.id, done.assetId))).toHaveLength(0);
      for (const kept of [recent, open]) {
        expect(await memoryStorage(ctx).getObject('private', kept.key, { maxBytes: 100 })).not.toBeNull();
        expect(await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.id, kept.assetId))).toHaveLength(1);
      }
    });

    it('documentos de loja reprovada somem 90 dias depois da decisão; loja aprovada e reprovada recente mantêm; upload pendente vencido é limpo (DT-032)', async () => {
      const owner = await registerUser(ctx);
      const doc = async (status: 'rejected' | 'approved', decidedDaysAgo: number) => {
        const user = await registerUser(ctx);
        const store = await insertStoreRow(ctx, user.userId, { status, decidedAt: new Date(Date.now() - decidedDaysAgo * DAY) });
        const key = `store-docs/${randomUUID()}.pdf`;
        await memoryStorage(ctx).putObject('private', key, Buffer.from('doc'), 'application/pdf');
        const [asset] = await ctx.db.insert(mediaAssets).values({ ownerUserId: user.userId, storeId: store.id, purpose: 'store_document', status: 'ready', objectKey: key, declaredContentType: 'application/pdf', declaredSizeBytes: 3, expiresAt: new Date(Date.now() + 1e6) }).returning();
        await ctx.db.insert(storeDocuments).values({ storeId: store.id, kind: 'id_front', assetId: asset!.id, uploadedBy: user.userId });
        return { storeId: store.id, key };
      };
      const old = await doc('rejected', 120);
      const recent = await doc('rejected', 30);
      const approved = await doc('approved', 400);
      const pendingKey = `pending/${randomUUID()}.jpg`;
      await memoryStorage(ctx).putObject('private', pendingKey, Buffer.from('x'), 'image/jpeg');
      const [pending] = await ctx.db.insert(mediaAssets).values({ ownerUserId: owner.userId, purpose: 'banner', status: 'pending', objectKey: pendingKey, declaredContentType: 'image/jpeg', declaredSizeBytes: 1, expiresAt: new Date(Date.now() - 3 * DAY) }).returning();

      const result = await retention.run();
      expect(result.errors).toEqual([]);
      expect(await memoryStorage(ctx).getObject('private', old.key, { maxBytes: 100 })).toBeNull();
      expect(await ctx.db.select().from(storeDocuments).where(eq(storeDocuments.storeId, old.storeId))).toHaveLength(0);
      for (const kept of [recent, approved]) {
        expect(await memoryStorage(ctx).getObject('private', kept.key, { maxBytes: 100 })).not.toBeNull();
        expect(await ctx.db.select().from(storeDocuments).where(eq(storeDocuments.storeId, kept.storeId))).toHaveLength(1);
      }
      // A loja reprovada continua (decisão e CPF são do registro), só os arquivos saem.
      expect((await ctx.db.select().from(stores).where(eq(stores.id, old.storeId)))[0]!.status).toBe('rejected');
      expect(await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.id, pending!.id))).toHaveLength(0);
      expect(await memoryStorage(ctx).getObject('private', pendingKey, { maxBytes: 100 })).toBeNull();
    });
  });
});
