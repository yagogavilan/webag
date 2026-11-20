import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ExchangeEventBus, ExchangesService, type ExchangeReminder } from '../src/modules/exchanges/index.js';
import { exchangeRequests, orderItems, orders, paymentAttempts, paymentRefunds, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/** DT-050: lembretes de 12 h e 4 h do SLA da loja, contestação da recusa (WB-176) e mediação do admin (WB-110). */
describe('SLA da troca, contestação e mediação (DT-050)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let support: Awaited<ReturnType<typeof createAdmin>>;
  const reminders: ExchangeReminder[] = [];
  const service = () => ctx.app.get(ExchangesService);
  const HOUR = 3_600_000;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ops = await createAdmin(ctx, 'operations');
    support = await createAdmin(ctx, 'support');
    ctx.app.get(ExchangeEventBus).subscribeReminder((r) => void reminders.push(r));
  });
  afterAll(() => ctx.close());

  async function delivered() {
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const [order] = await ctx.db.select().from(orders).where(eq(orders.id, created.id));
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7, deliverySnapshot: { ...(order!.deliverySnapshot ?? {}), exchangeFeeCents: 900, expectedCostCents: 700 } }).where(eq(orders.id, created.id));
    const productId = (await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!)))[0]!.productId;
    const [sizeM] = await ctx.db.insert(productVariants).values({ productId, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
    const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, created.id));
    return { shop, buyer, orderId: created.id, sizeM: sizeM!, itemId: item!.id };
  }
  type D = Awaited<ReturnType<typeof delivered>>;
  const open = async (d: D, body: Record<string, unknown>) => (await ctx.http.post(`/v1/orders/${d.orderId}/exchanges`).set(bearer(d.buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send(body).expect(201)).body as { id: string };
  const sizeBody = (d: D) => ({ orderItemId: d.itemId, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: d.sizeM.id });
  const storeAct = (d: D, id: string, action: string, body: Record<string, unknown> = {}) => ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${id}/${action}`).set(bearer(d.shop.store.owner.accessToken)).send(body);
  const row = async (id: string) => (await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, id)))[0]!;
  const deadline = (id: string, ms: number) => ctx.db.update(exchangeRequests).set({ answerDeadlineAt: new Date(Date.now() + ms) }).where(eq(exchangeRequests.id, id));
  const remindersOf = (id: string) => reminders.filter((r) => r.exchangeId === id).map((r) => r.hoursLeft);

  // ---------------------------------------------------------------------------------------- lembretes

  it('lembretes à loja: 12 h e 4 h antes do fim do SLA, cada um UMA vez; fora da janela ou já respondida, nada', async () => {
    const d = await delivered();
    const a = await open(d, sizeBody(d));
    await service().remindStoreDeadlines();
    expect(remindersOf(a.id)).toEqual([]); // 24 h de SLA: ainda longe

    await deadline(a.id, 13 * HOUR);
    await service().remindStoreDeadlines();
    expect(remindersOf(a.id)).toEqual([]);

    await deadline(a.id, 11 * HOUR + 59 * 60_000);
    expect(await service().remindStoreDeadlines()).toBeGreaterThanOrEqual(1);
    expect(remindersOf(a.id)).toEqual([12]);
    await service().remindStoreDeadlines();
    await service().sweep(); // a varredura geral também lembra, sem repetir
    expect(remindersOf(a.id)).toEqual([12]);
    expect(reminders.find((r) => r.exchangeId === a.id)).toMatchObject({ number: expect.stringMatching(/^TR-/), storeId: d.shop.store.id, type: 'size_color' });

    await deadline(a.id, 3 * HOUR);
    await service().remindStoreDeadlines();
    await service().remindStoreDeadlines();
    expect(remindersOf(a.id)).toEqual([12, 4]);
    expect(await row(a.id)).toMatchObject({ status: 'requested' }); // lembrar não muda o estado

    // SLA que já nasce com menos de 12 h: só o de 4 h (e o de 12 h fica marcado, sem sair depois)
    const e = await delivered();
    const b = await open(e, sizeBody(e));
    await deadline(b.id, 3 * HOUR);
    await service().remindStoreDeadlines();
    expect(remindersOf(b.id)).toEqual([4]);
    expect((await row(b.id)).reminder12SentAt).not.toBeNull();

    // já respondida: sem lembrete
    const f = await delivered();
    const c = await open(f, sizeBody(f));
    await storeAct(f, c.id, 'accept').expect(200);
    await deadline(c.id, 3 * HOUR);
    await service().remindStoreDeadlines();
    expect(remindersOf(c.id)).toEqual([]);
  });

  it('duas varreduras ao mesmo tempo não duplicam o lembrete', async () => {
    const d = await delivered();
    const a = await open(d, sizeBody(d));
    await deadline(a.id, 10 * HOUR);
    await Promise.all([service().remindStoreDeadlines(), service().remindStoreDeadlines(), service().remindStoreDeadlines()]);
    expect(remindersOf(a.id)).toEqual([12]);
  });

  // ---------------------------------------------------------------------------------------- contestação

  async function refused() {
    const d = await delivered();
    const a = await open(d, sizeBody(d));
    await storeAct(d, a.id, 'refuse', { reason: 'Item usado, sem etiqueta' }).expect(200);
    return { d, id: a.id };
  }
  const contest = (d: D, id: string, text = 'O item está novo e com a etiqueta, segue a foto.', user = d.buyer.user) => ctx.http.post(`/v1/exchanges/${id}/contest`).set(bearer(user.accessToken)).send({ text });

  it('contestar a recusa da loja leva à mediação, uma vez, idempotente; só o dono; texto de 10 a 500 caracteres', async () => {
    const { d, id } = await refused();
    const view = (await ctx.http.get(`/v1/exchanges/${id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body;
    expect(view).toMatchObject({ status: 'rejected', contested: false });
    expect(new Date(view.contestableUntil).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * HOUR); // contestacao_dias = 7

    expect((await contest(d, id, 'curto')).status).toBe(400);
    expect((await contest(d, id, 'x'.repeat(501))).status).toBe(400);
    expect((await contest(d, id, undefined, await createCustomer(ctx))).status).toBe(404);
    const res = await contest(d, id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: 'in_mediation', contested: true, contestableUntil: null });
    expect(await row(id)).toMatchObject({ status: 'in_mediation', contestationText: expect.stringContaining('etiqueta') });
    expect((await row(id)).mediationStartedAt).not.toBeNull();
    expect((await contest(d, id)).status).toBe(200); // repetir (3G) é o mesmo resultado
    expect((await ctx.http.get(`/v1/exchanges/${id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body.timeline.filter((t: { to: string }) => t.to === 'in_mediation')).toHaveLength(1);
  });

  it('não contesta o que não foi recusado pela loja, nem depois de `contestacao_dias`', async () => {
    const d = await delivered();
    const a = await open(d, sizeBody(d));
    const early = await contest(d, a.id);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('EXCHANGE_NOT_CONTESTABLE');

    const { d: e, id } = await refused();
    await ctx.db.update(exchangeRequests).set({ decidedAt: new Date(Date.now() - 8 * 24 * HOUR) }).where(eq(exchangeRequests.id, id));
    const late = await contest(e, id);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('EXCHANGE_CONTEST_EXPIRED');
    expect((await ctx.http.get(`/v1/exchanges/${id}`).set(bearer(e.buyer.user.accessToken)).expect(200)).body.contestableUntil).not.toBeNull(); // a data aparece; o servidor é quem decide
  });

  // ---------------------------------------------------------------------------------------- mediação

  const queue = (admin: { accessToken: string }) => ctx.http.get('/v1/admin/exchanges/mediations?limit=50').set(bearer(admin.accessToken));
  const decide = (admin: { accessToken: string }, id: string, body: Record<string, unknown>) => ctx.http.post(`/v1/admin/exchanges/mediations/${id}/decision`).set(bearer(admin.accessToken)).send(body);

  it('fila de mediação: operação lê, suporte não; mais antiga primeiro; "atrasado" depois de mediacao_dias_uteis; origem da disputa', async () => {
    const { d, id } = await refused();
    await contest(d, id).expect(200);
    await queue(support).expect(403);
    await ctx.http.get('/v1/admin/exchanges/mediations').expect(401);
    const fresh = (await queue(ops)).body.data.find((m: { id: string }) => m.id === id);
    expect(fresh).toMatchObject({ origin: 'customer_contest', type: 'size_color', storeReason: 'Item usado, sem etiqueta', overdue: false, refusalNotAllowedByLaw: false });
    expect(fresh.customerText).toContain('etiqueta');
    await ctx.db.update(exchangeRequests).set({ mediationStartedAt: new Date(Date.now() - 12 * 24 * HOUR) }).where(eq(exchangeRequests.id, id));
    const list = (await queue(ops)).body.data as { id: string; overdue: boolean; startedAt: string }[];
    expect(list.find((m) => m.id === id)?.overdue).toBe(true);
    const times = list.map((m) => new Date(m.startedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('decisão a favor do CLIENTE em recusa contestada: a troca é aprovada e segue o fluxo da taxa; justificativa obrigatória; só operação/super; não repete', async () => {
    const { d, id } = await refused();
    await contest(d, id).expect(200);
    expect((await decide(ops, id, { decision: 'customer', reason: 'curto' })).status).toBe(400);
    expect((await decide(support, id, { decision: 'customer', reason: 'a loja não provou o uso do item' })).status).toBe(403);
    const ok = await decide(ops, id, { decision: 'customer', reason: 'a loja não provou o uso do item' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(await row(id)).toMatchObject({ status: 'awaiting_fee', decidedBy: 'admin', feeCents: 900, reservationState: 'reserved' });
    expect((await ctx.http.get(`/v1/exchanges/${id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body.timeline.at(-1)).toMatchObject({ actor: 'admin', to: 'awaiting_fee', reason: 'a loja não provou o uso do item' });
    const again = await decide(ops, id, { decision: 'customer', reason: 'a loja não provou o uso do item' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('EXCHANGE_NOT_IN_MEDIATION');
    // o cliente paga a taxa e a troca segue (coleta entra na fila)
    await ctx.http.post(`/v1/exchanges/${id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    const [attempt] = await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${id}`));
    await approve(ctx, d.buyer.user, attempt!.id);
    expect((await row(id)).status).toBe('approved');
  });

  it('decisão a favor da LOJA: recusa final (libera a reserva) e o cliente não contesta de novo; a decisão chega com a justificativa', async () => {
    const { d, id } = await refused();
    await contest(d, id).expect(200);
    await decide(ops, id, { decision: 'store', reason: 'foto mostra uso do item, recusa mantida' }).expect(200);
    expect(await row(id)).toMatchObject({ status: 'rejected', decidedBy: 'admin', decisionReason: 'foto mostra uso do item, recusa mantida' });
    const view = (await ctx.http.get(`/v1/exchanges/${id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body;
    expect(view).toMatchObject({ status: 'rejected', contestableUntil: null });
    const second = await contest(d, id);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('EXCHANGE_NOT_CONTESTABLE');
    expect((await queue(ops)).body.data.some((m: { id: string }) => m.id === id)).toBe(false);
  });

  it('inspeção reprovada vai à mediação (item já na loja): a favor do cliente reembolsa; a favor da loja encerra sem reembolso', async () => {
    const reproved = async () => {
      const d = await delivered();
      const a = await open(d, { orderItemId: d.itemId, type: 'withdrawal', method: 'drop_at_store' }); // arrependimento: nasce aprovada
      const code = (await ctx.http.get(`/v1/exchanges/${a.id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body.storeCode as string;
      await storeAct(d, a.id, 'receive', { ok: false, reason: 'Sinais de uso além do razoável', code }).expect(200);
      expect((await row(a.id)).status).toBe('in_mediation');
      return { d, id: a.id };
    };
    const a = await reproved();
    const item = (await queue(ops)).body.data.find((m: { id: string }) => m.id === a.id);
    expect(item).toMatchObject({ origin: 'inspection_failed', refusalNotAllowedByLaw: true }); // arrependimento: alerta e sugestão de aprovar (WB-110 C3)
    await decide(ops, a.id, { decision: 'customer', reason: 'sem sinais de uso nas fotos da inspeção' }).expect(200);
    expect(await row(a.id)).toMatchObject({ status: 'completed' });
    const attempt = await attemptOf(ctx, a.d.orderId);
    expect((await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).length).toBe(1);

    const b = await reproved();
    await decide(ops, b.id, { decision: 'store', reason: 'uso comprovado, sem direito ao reembolso' }).expect(200);
    expect(await row(b.id)).toMatchObject({ status: 'rejected', decidedBy: 'admin' });
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, (await attemptOf(ctx, b.d.orderId)).id))).toHaveLength(0);
  });
});
