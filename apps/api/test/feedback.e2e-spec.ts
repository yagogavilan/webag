import { ParametersService } from '../src/modules/admin/index.js';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { contentReports, reviews, storeMembers } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { shopWith } from './helpers/orders.js';

const DAY = 86_400_000;

describe('Ajuda, denúncia, moderação e resposta do lojista (O6.5)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let support: Awaited<ReturnType<typeof createAdmin>>;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ops = await createAdmin(ctx, 'operations');
    support = await createAdmin(ctx, 'support');
  });
  afterAll(() => ctx.close());

  describe('ajuda (WB-034, WB-227, AJ3)', () => {
    it('perguntas e contatos vêm da configuração do admin: publicadas por grupo e na ordem; despublicar some; cada público vê as suas; permissões', async () => {
      await ctx.http.get('/v1/admin/help/faqs').expect(401);
      await ctx.http.get('/v1/admin/help/faqs').set(bearer((await createCustomer(ctx)).accessToken)).expect(403);
      await ctx.http.get('/v1/admin/help/faqs').set(bearer(support.accessToken)).expect(200);
      const faq = (body: Record<string, unknown>, token = ops.accessToken) => ctx.http.post('/v1/admin/help/faqs').set(bearer(token)).send(body);
      await faq({ audience: 'customer', group: 'order', question: 'Quanto tempo demora?', answer: 'Em média de 30 a 60 minutos.' }, support.accessToken).expect(403); // suporte só lê

      const a = (await faq({ audience: 'customer', group: 'order', question: 'Quanto tempo demora a entrega?', answer: 'Em média de 30 a 60 minutos.' }).expect(201)).body;
      const b = (await faq({ audience: 'customer', group: 'order', question: 'Posso cancelar o pedido?', answer: 'Até a loja aceitar, direto no app.' }).expect(201)).body;
      const c = (await faq({ audience: 'customer', group: 'payment', question: 'Posso pagar com PIX?', answer: 'Sim, o PIX confirma na hora.' }).expect(201)).body;
      await faq({ audience: 'merchant', group: 'orders', question: 'Como aceitar um pedido?', answer: 'Toque em Aceitar no cartão do pedido.' }).expect(201);
      await faq({ audience: 'customer', group: 'orders', question: 'Grupo errado', answer: 'x'.repeat(10) }).expect(400); // `orders` é do lojista
      await faq({ audience: 'customer', group: 'order', question: 'x'.repeat(101), answer: 'ok ok' }).expect(400);
      expect([a.position, b.position, c.position]).toEqual([0, 1, 0]);

      const help = async (audience?: string) => (await ctx.http.get(`/v1/help${audience ? `?audience=${audience}` : ''}`).expect(200)).body;
      const customer = await help();
      expect(customer.groups.map((g: { id: string; label: string }) => [g.id, g.label])).toEqual([['order', 'Pedido'], ['payment', 'Pagamento']]);
      expect(customer.groups[0].items.map((i: { question: string }) => i.question)).toEqual(['Quanto tempo demora a entrega?', 'Posso cancelar o pedido?']);
      expect((await help('merchant')).groups.map((g: { id: string }) => g.id)).toEqual(['orders']);
      await ctx.http.get('/v1/help?audience=outro').expect(400);

      // Reordenar (todas as perguntas do grupo, uma vez cada) e despublicar.
      await ctx.http.post('/v1/admin/help/faqs/reorder').set(bearer(ops.accessToken)).send({ audience: 'customer', group: 'order', ids: [a.id] }).expect(400);
      await ctx.http.post('/v1/admin/help/faqs/reorder').set(bearer(ops.accessToken)).send({ audience: 'customer', group: 'order', ids: [b.id, a.id] }).expect(200);
      expect((await help()).groups[0].items.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]); // cache invalidado na hora
      await ctx.http.patch(`/v1/admin/help/faqs/${a.id}`).set(bearer(ops.accessToken)).send({ published: false }).expect(200);
      expect((await help()).groups[0].items.map((i: { id: string }) => i.id)).toEqual([b.id]);
      await ctx.http.delete(`/v1/admin/help/faqs/${c.id}`).set(bearer(ops.accessToken)).expect(204);
      await ctx.http.delete(`/v1/admin/help/faqs/${c.id}`).set(bearer(ops.accessToken)).expect(404);
      expect((await help()).groups.map((g: { id: string }) => g.id)).toEqual(['order']); // grupo sem pergunta some

      // Contatos: configuração, não constante.
      const put = (body: Record<string, unknown>, token = ops.accessToken) => ctx.http.put('/v1/admin/help/contacts').set(bearer(token)).send(body);
      await put({ supportWhatsapp: '11999990000' }, support.accessToken).expect(403);
      await put({ supportWhatsapp: '123' }).expect(400);
      await put({ supportEmail: 'sem-arroba' }).expect(400);
      await put({ supportHours: 'x'.repeat(61) }).expect(400);
      await put({ supportWhatsapp: '(11) 99999-0000', supportEmail: 'Ajuda@Webag.com.br', supportHours: 'Seg a sex, 9h às 18h', privacyOfficerName: 'Yago', privacyOfficerEmail: 'privacidade@webag.com.br' }).expect(200);
      expect((await help()).contacts).toEqual({ whatsapp: '11999990000', email: 'ajuda@webag.com.br', hours: 'Seg a sex, 9h às 18h' });
      expect((await help('merchant')).privacy).toMatchObject({ officerName: 'Yago', officerEmail: 'privacidade@webag.com.br' });
      // SEC-178 / W.1: os prazos reais da exclusão vêm do endpoint público (parâmetros e DSR_DEADLINE_DAYS)
      const params = ctx.app.get(ParametersService);
      expect((await help('customer')).privacy).toMatchObject({ deletionRegretHours: Math.min(await params.getNumber('exclusao_arrependimento_horas'), (await params.getNumber('exclusao_anonimizacao_dias')) * 24), fiscalRetentionYears: await params.getNumber('retencao_fiscal_anos'), accessLogMonths: await params.getNumber('retencao_log_acesso_meses'), privacyAnswerDays: 15 });
      await put({ supportHours: null }).expect(200);
      expect((await help()).contacts.hours).toBeNull();
      const audit = (await ctx.http.get('/v1/admin/audit-log?action=help.contacts_updated').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body.data;
      expect(audit.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('denúncia e moderação (WB-038, WB-124)', () => {
    async function scenario() {
      const shop = await shopWith(ctx, [{ name: 'Produto Denunciado', priceCents: 3_000, stock: 5 }]);
      const author = await registerUser(ctx);
      const [review] = await ctx.db.insert(reviews).values({ storeId: shop.store.id, userId: author.userId, rating: 1, comment: 'Atendimento horrível, o dono é um ladrão' }).returning();
      return { shop, author, review: review! };
    }
    const report = (token: string, body: Record<string, unknown>) => ctx.http.post('/v1/reports').set(bearer(token)).send(body);

    it('denunciar: sempre a mesma resposta (também na repetição e na própria avaliação); loja não denuncia a si mesma; alvo inexistente 404; "Denunciada" em /me/reports', async () => {
      const { shop, author, review } = await scenario();
      const reporter = await createCustomer(ctx);
      await ctx.http.post('/v1/reports').send({}).expect(401);
      const first = await report(reporter.accessToken, { targetType: 'review', targetId: review.id, reason: 'offensive', text: 'Xingamento ao dono' }).expect(202);
      const again = await report(reporter.accessToken, { targetType: 'review', targetId: review.id, reason: 'false' }).expect(202);
      expect(again.body).toEqual(first.body);
      expect(first.body).toEqual({ received: true });
      expect(await ctx.db.select().from(contentReports).where(eq(contentReports.targetId, review.id))).toHaveLength(1); // a repetição não cria outra
      await report(author.accessToken, { targetType: 'review', targetId: review.id, reason: 'other' }).expect(202); // a própria avaliação: nada é gravado
      expect(await ctx.db.select().from(contentReports).where(eq(contentReports.targetId, review.id))).toHaveLength(1);

      await report(reporter.accessToken, { targetType: 'product', targetId: shop.store.productIds[0], reason: 'prohibited' }).expect(202);
      await report(reporter.accessToken, { targetType: 'store', targetId: shop.store.id, reason: 'scam' }).expect(202);
      expect((await report(shop.store.owner.accessToken, { targetType: 'store', targetId: shop.store.id, reason: 'other' }).expect(403)).body.code).toBe('CANNOT_REPORT_OWN');
      expect((await report(shop.store.owner.accessToken, { targetType: 'product', targetId: shop.store.productIds[0], reason: 'other' })).status).toBe(403);
      await report(reporter.accessToken, { targetType: 'review', targetId: randomUUID(), reason: 'other' }).expect(404);
      await report(reporter.accessToken, { targetType: 'review', targetId: review.id, reason: 'avaliacao-negativa' }).expect(400);
      await report(reporter.accessToken, { targetType: 'review', targetId: review.id, reason: 'other', text: 'x'.repeat(201) }).expect(400);
      const mine = (await ctx.http.get('/v1/me/reports').set(bearer(reporter.accessToken)).expect(200)).body.data as { targetType: string; targetId: string }[];
      expect(mine.map((m) => `${m.targetType}:${m.targetId}`).sort()).toEqual([`product:${shop.store.productIds[0]}`, `review:${review.id}`, `store:${shop.store.id}`].sort());
      expect((await ctx.http.get('/v1/me/reports').set(bearer(author.accessToken)).expect(200)).body.data).toEqual([]); // só as minhas (IDOR)
    });

    it('fila por alvo com contagem, motivos e prazo; manter encerra e avisa; remover só avaliação, com motivo, some da vitrine e avisa o autor; encaminhar produto e loja', async () => {
      const { shop, author, review } = await scenario();
      const r1 = await createCustomer(ctx);
      const r2 = await createCustomer(ctx);
      await report(r1.accessToken, { targetType: 'review', targetId: review.id, reason: 'offensive' }).expect(202);
      await report(r2.accessToken, { targetType: 'review', targetId: review.id, reason: 'false', text: 'Nunca comprou aqui' }).expect(202);
      await report(r1.accessToken, { targetType: 'product', targetId: shop.store.productIds[0], reason: 'prohibited' }).expect(202);
      await report(r1.accessToken, { targetType: 'store', targetId: shop.store.id, reason: 'scam' }).expect(202);

      const q = (token = ops.accessToken, qs = 'targetType=review') => ctx.http.get(`/v1/admin/content-reports?${qs}`).set(bearer(token));
      await q(support.accessToken).expect(403);
      await ctx.http.get('/v1/admin/content-reports?targetType=review').expect(401);
      await q(ops.accessToken, 'targetType=nada').expect(400);
      const row = ((await q().expect(200)).body.data as { targetId: string; reports: number; reasons: string[]; overdue: boolean; excerpt: string | null }[]).find((d) => d.targetId === review.id)!;
      expect(row).toMatchObject({ reports: 2, overdue: false });
      expect(row.reasons.sort()).toEqual(['false', 'offensive']);
      expect(row.excerpt).toContain('Atendimento');
      // Prazo de 2 dias úteis: denúncia antiga fica "Atrasado".
      await ctx.db.update(contentReports).set({ createdAt: new Date(Date.now() - 6 * DAY) }).where(eq(contentReports.reporterId, r1.userId));
      expect(((await q().expect(200)).body.data as { targetId: string; overdue: boolean }[]).find((d) => d.targetId === review.id)!.overdue).toBe(true);

      const detail = (await ctx.http.get(`/v1/admin/content-reports/review/${review.id}`).set(bearer(ops.accessToken)).expect(200)).body;
      expect(detail.item).toMatchObject({ rating: 1, status: 'published' });
      expect(detail.item.author).toMatch(/^M\.? ?/); // autor abreviado
      expect(detail.reports).toHaveLength(2);
      expect(JSON.stringify(detail)).not.toContain(r1.email);
      await ctx.http.get(`/v1/admin/content-reports/review/${randomUUID()}`).set(bearer(ops.accessToken)).expect(404);
      await ctx.http.get(`/v1/admin/content-reports/nada/${review.id}`).set(bearer(ops.accessToken)).expect(404);

      // Remover: motivo da lista; "avaliação negativa" não existe; produto/loja não se removem por aqui.
      const remove = (body: Record<string, unknown>, token = ops.accessToken) => ctx.http.post(`/v1/admin/content-reports/review/${review.id}/remove`).set(bearer(token)).send(body);
      await remove({ reasonCode: 'avaliacao_negativa' }).expect(400);
      await remove({ reasonCode: 'offense' }, support.accessToken).expect(403);
      ctx.mail.outbox.length = 0;
      expect((await remove({ reasonCode: 'personal_data', note: 'Cita o nome do dono' }).expect(200)).body).toEqual({ status: 'removed', reports: 2 });
      expect((await ctx.db.select().from(reviews).where(eq(reviews.id, review.id)))[0]!.status).toBe('removed');
      expect(ctx.mail.to(author.email).at(-1)!.text).toContain('Não removemos avaliação só por ser negativa');
      expect(ctx.mail.to(r2.email).at(-1)!.text).toContain('foi removida');
      const pub = (await ctx.http.get(`/v1/browse/stores/${shop.store.id}/reviews`).expect(200)).body.data as { id: string }[];
      expect(pub.map((x) => x.id)).not.toContain(review.id);
      expect((await remove({ reasonCode: 'spam' })).body.code).toBe('REPORT_ALREADY_HANDLED');
      expect(((await q(ops.accessToken, 'targetType=review&status=handled').expect(200)).body.data as { targetId: string }[]).map((d) => d.targetId)).toContain(review.id);
      expect(((await q().expect(200)).body.data as { targetId: string }[]).map((d) => d.targetId)).not.toContain(review.id);

      const forward = (type: string, id: string) => ctx.http.post(`/v1/admin/content-reports/${type}/${id}/forward`).set(bearer(ops.accessToken)).send({});
      expect((await forward('product', shop.store.productIds[0]!).expect(200)).body).toMatchObject({ status: 'forwarded', next: { moderation: 'product' } });
      expect((await forward('store', shop.store.id).expect(200)).body.next).toMatchObject({ moderation: 'store', storeId: shop.store.id });
      await forward('review', review.id).expect(400);

      // Manter: encerra e avisa quem denunciou.
      const other = await scenario();
      const rep = await createCustomer(ctx);
      await report(rep.accessToken, { targetType: 'review', targetId: other.review.id, reason: 'offensive' }).expect(202);
      ctx.mail.outbox.length = 0;
      expect((await ctx.http.post(`/v1/admin/content-reports/review/${other.review.id}/keep`).set(bearer(ops.accessToken)).send({ note: 'Crítica ao serviço, sem ofensa' }).expect(200)).body).toEqual({ status: 'kept', reports: 1 });
      expect(ctx.mail.to(rep.email).at(-1)!.text).toContain('segue publicado');
      expect((await ctx.db.select().from(reviews).where(eq(reviews.id, other.review.id)))[0]!.status).toBe('published');
      const audit = (await ctx.http.get('/v1/admin/audit-log?action=review.removed').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body.data as { targetId: string; reason: string }[];
      expect(audit.some((a) => a.targetId === review.id && a.reason.startsWith('personal_data'))).toBe(true);
    });
  });

  describe('resposta do lojista às avaliações', () => {
    it('lista com filtros; responde, edita e apaga; funcionário sem a permissão 403; outra loja 404; avaliação removida some', async () => {
      const shop = await shopWith(ctx, [{ name: 'Produto Avaliado', priceCents: 3_000, stock: 5 }]);
      const other = await shopWith(ctx, [{ name: 'Outro', priceCents: 3_000, stock: 5 }]);
      const owner = shop.store.owner.accessToken;
      const buyer = await registerUser(ctx, { name: 'Joana Pereira Lima' });
      const [five] = await ctx.db.insert(reviews).values({ storeId: shop.store.id, userId: buyer.userId, rating: 5, comment: 'Ótimo!' }).returning();
      const [two] = await ctx.db.insert(reviews).values({ storeId: shop.store.id, userId: buyer.userId, productId: shop.store.productIds[0]!, rating: 2, comment: 'Veio com defeito' }).returning();
      const base = `/v1/stores/${shop.store.id}/reviews`;

      await ctx.http.get(base).expect(401);
      const all = (await ctx.http.get(base).set(bearer(owner)).expect(200)).body;
      expect(all.data).toHaveLength(2);
      expect(all.data.find((r: { id: string }) => r.id === two!.id)).toMatchObject({ reviewer: 'Joana L.', target: { type: 'product', name: 'Produto Avaliado' }, storeReply: null });
      expect(JSON.stringify(all)).not.toContain(buyer.email);
      expect((await ctx.http.get(`${base}?rating=2`).set(bearer(owner)).expect(200)).body.data.map((r: { id: string }) => r.id)).toEqual([two!.id]);
      expect((await ctx.http.get(`${base}?limit=1`).set(bearer(owner)).expect(200)).body.nextCursor).not.toBeNull();

      const reply = (token: string, id: string, text: string) => ctx.http.put(`${base}/${id}/reply`).set(bearer(token)).send({ text });
      await reply(owner, two!.id, '').expect(400);
      await reply(owner, two!.id, 'x'.repeat(501)).expect(400);
      expect((await reply(owner, two!.id, 'Sentimos muito, vamos trocar a peça.').expect(200)).body).toMatchObject({ id: two!.id, storeReply: 'Sentimos muito, vamos trocar a peça.' });
      expect((await ctx.http.get(`${base}?replied=false`).set(bearer(owner)).expect(200)).body.data.map((r: { id: string }) => r.id)).toEqual([five!.id]);
      expect((await ctx.http.get(`${base}?replied=true`).set(bearer(owner)).expect(200)).body.data.map((r: { id: string }) => r.id)).toEqual([two!.id]);
      await reply(owner, two!.id, 'Texto corrigido.').expect(200); // editar
      const pub = (await ctx.http.get(`/v1/browse/products/${shop.store.productIds[0]}/reviews`).expect(200)).body.data as { id: string; storeReply: string | null }[];
      expect(pub.find((r) => r.id === two!.id)!.storeReply).toBe('Texto corrigido.');

      // IDOR e permissão.
      await reply(other.store.owner.accessToken, two!.id, 'Invasor').expect(404); // não é membro da loja
      await ctx.http.get(base).set(bearer(other.store.owner.accessToken)).expect(404);
      await reply(shop.store.owner.accessToken, (await ctx.db.insert(reviews).values({ storeId: other.store.id, userId: buyer.userId, rating: 4 }).returning())[0]!.id, 'De outra loja').expect(404);
      const staff = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: shop.store.id, userId: staff.userId, role: 'staff', permissions: ['catalog'] });
      await reply(staff.accessToken, two!.id, 'Sem permissão').expect(403);
      await ctx.http.get(base).set(bearer(staff.accessToken)).expect(403);
      const staffReviews = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: shop.store.id, userId: staffReviews.userId, role: 'staff', permissions: ['reviews'] });
      await reply(staffReviews.accessToken, five!.id, 'Obrigado!').expect(200);

      await ctx.http.delete(`${base}/${two!.id}/reply`).set(bearer(owner)).expect(204);
      await ctx.http.delete(`${base}/${two!.id}/reply`).set(bearer(owner)).expect(204); // idempotente
      expect((await ctx.db.select().from(reviews).where(eq(reviews.id, two!.id)))[0]).toMatchObject({ storeReply: null, storeRepliedAt: null });
      await ctx.db.update(reviews).set({ status: 'removed' }).where(eq(reviews.id, two!.id));
      await reply(owner, two!.id, 'Tarde demais').expect(404);
      expect((await ctx.http.get(base).set(bearer(owner)).expect(200)).body.data.map((r: { id: string }) => r.id)).toEqual([five!.id]);
    });
  });
});
