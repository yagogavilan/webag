import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { DeliveriesService } from '../src/modules/logistics/index.js';
import { auditLog, deliveries, paymentAlerts, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';

type Admin = Awaited<ReturnType<typeof createAdmin>>;
const DAY = 86_400_000;

/** SEC-143 (devolução à loja), SEC-144 (contato do cliente na corrida) e SEC-145 (custo do motoboy), do Security (revisao-logistica.md). */
describe('Logística: SEC-143, SEC-144 e SEC-145', () => {
  let ctx: TestContext;
  let svc: DeliveriesService;
  let ops: Admin, ops2: Admin, finance: Admin, support: Admin, superAdmin: Admin;
  const H = (a: Admin) => bearer(a.accessToken);
  const base = '/v1/admin/logistics';
  const sys = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
  const storeAuth = (shop: Shop) => bearer(shop.store.owner.accessToken);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    svc = ctx.app.get(DeliveriesService);
    [ops, ops2, finance, support, superAdmin] = [
      await createAdmin(ctx, 'operations'),
      await createAdmin(ctx, 'operations'),
      await createAdmin(ctx, 'finance'),
      await createAdmin(ctx, 'support'),
      await createAdmin(ctx, 'super_admin'),
    ];
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });

  const courier = async () => (await ctx.http.post(`${base}/couriers`).set(H(ops)).send({ name: 'Carlos Moto Silva', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
  const act = (a: Admin, id: string, body: Record<string, unknown>) => ctx.http.post(`${base}/deliveries/${id}/status`).set(H(a)).send(body);
  const dbRow = async (id: string) => (await ctx.db.select().from(deliveries).where(eq(deliveries.id, id)))[0]!;
  const alerts = async (kind: string) => (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, kind))).map((a) => a.details);

  /** Pedido pago, aceito e "pronto para coleta": a corrida real, com o contato do cliente. */
  async function readyOrder() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    const attempt = await attemptOf(ctx, created.id);
    await approve(ctx, buyer.user, attempt.id);
    const url = `/v1/stores/${shop.store.id}/orders/${created.id}`;
    await ctx.http.post(`${url}/accept`).set(storeAuth(shop)).expect(200);
    await ctx.http.post(`${url}/status`).set(storeAuth(shop)).send({ status: 'ready_for_collection' }).expect(200);
    const [delivery] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, created.id));
    return { shop, buyer, orderId: created.id, attempt, url, delivery: delivery! };
  }
  async function toNotDelivered(r: Awaited<ReturnType<typeof readyOrder>>) {
    const m = await courier();
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(H(ops)).send({ courierId: m.id }).expect(200);
    await act(ops, r.delivery.id, { action: 'confirm' }).expect(200);
    await act(ops, r.delivery.id, { action: 'picked_up' }).expect(200);
    await act(ops, r.delivery.id, { action: 'not_delivered', failReason: 'customer_absent' }).expect(200);
  }

  // ------------------------------------------------------------------------------------------ SEC-143

  it('SEC-143: a operação declarar "devolvida à loja" NÃO cancela nem estorna; a loja confirma o recebimento e só então o pedido é cancelado e estornado por inteiro', async () => {
    const r = await readyOrder();
    await toNotDelivered(r);
    await act(ops, r.delivery.id, { action: 'return_confirmed' }).expect(200);

    // sem a loja: o pedido segue ativo e nada foi estornado; o admin é alertado
    expect((await orderRow(ctx, r.orderId)).status).toBe('out_for_delivery');
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id))).toHaveLength(0);
    expect((await alerts('return_awaiting_store')).some((d) => d.orderId === r.orderId)).toBe(true);

    // outra loja não confirma o que não é dela (404 sem revelar existência)
    const other = await shopWith(ctx, [{ name: 'Outro', priceCents: 1_000, stock: 1 }]);
    await ctx.http.post(`/v1/stores/${other.store.id}/orders/${r.orderId}/return-received`).set(storeAuth(other)).send({}).expect(404);
    // o cliente não confirma por conta própria (nem sabe que a rota existe)
    await ctx.http.post(`${r.url}/return-received`).set(bearer(r.buyer.user.accessToken)).send({}).expect(404);

    await ctx.http.post(`${r.url}/return-received`).set(storeAuth(r.shop)).send({}).expect(200);
    expect((await orderRow(ctx, r.orderId)).status).toBe('cancelled');
    expect((await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id))).map((x) => x.amountCents)).toEqual([r.attempt.amountCents]);
    expect(await dbRow(r.delivery.id)).toMatchObject({ storeReturnConfirmedVia: 'store' });
    // repetir não estorna de novo
    await ctx.http.post(`${r.url}/return-received`).set(storeAuth(r.shop)).send({}).expect(409);
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id))).toHaveLength(1);
  });

  it('SEC-143: sem a loja, o admin registra a confirmação com motivo (auditado), mas não quem declarou a devolução (exceto o super admin)', async () => {
    const r = await readyOrder();
    await toNotDelivered(r);
    await act(ops, r.delivery.id, { action: 'return_confirmed' }).expect(200);
    const url = `/v1/admin/orders/${r.orderId}/store-return`;
    await ctx.http.post(url).set(H(finance)).send({ reason: 'a loja confirmou por telefone' }).expect(403); // perfil sem permissão
    await ctx.http.post(url).set(H(ops2)).send({ reason: 'curto' }).expect(400);
    const same = await ctx.http.post(url).set(H(ops)).send({ reason: 'a loja confirmou por telefone' });
    expect(same.status, JSON.stringify(same.body)).toBe(403);
    expect(same.body.code).toBe('SEGREGATION_OF_DUTIES');
    expect((await orderRow(ctx, r.orderId)).status).toBe('out_for_delivery');

    await ctx.http.post(url).set(H(ops2)).send({ reason: 'a loja confirmou por telefone' }).expect(200);
    expect((await orderRow(ctx, r.orderId)).status).toBe('cancelled');
    expect(await dbRow(r.delivery.id)).toMatchObject({ storeReturnConfirmedVia: 'admin', storeReturnConfirmedBy: ops2.userId });
    expect((await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, r.delivery.id))).map((a) => a.action)).toContain('delivery.store_return_confirmed');
  });

  it('SEC-143: só vale para corrida já devolvida (409 em pedido sem devolução pendente)', async () => {
    const r = await readyOrder();
    await ctx.http.post(`${r.url}/return-received`).set(storeAuth(r.shop)).send({}).expect(409);
    expect((await orderRow(ctx, r.orderId)).status).toBe('ready_for_collection');
  });

  // ------------------------------------------------------------------------------------------ SEC-144

  it('SEC-144: WhatsApp só para a operação; o detalhe sem contato para financeiro e suporte; "Revelar" exige motivo e grava auditoria', async () => {
    const r = await readyOrder();
    const m = await courier();
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(H(ops)).send({ courierId: m.id }).expect(200);

    await ctx.http.get(`${base}/deliveries/${r.delivery.id}/whatsapp`).set(H(support)).expect(403);
    await ctx.http.get(`${base}/deliveries/${r.delivery.id}/whatsapp`).set(H(finance)).expect(403);
    await ctx.http.get(`${base}/deliveries/${r.delivery.id}/whatsapp`).set(H(ops)).expect(200);

    for (const a of [support, finance]) {
      const detail = (await ctx.http.get(`${base}/deliveries/${r.delivery.id}`).set(H(a)).expect(200)).body;
      expect(detail.contact).toBeUndefined();
      expect(JSON.stringify(detail)).not.toMatch(/11\d{9}|Rua Teste/);
    }
    expect((await ctx.http.get(`${base}/deliveries/${r.delivery.id}`).set(H(ops)).expect(200)).body.contact).toMatchObject({ customerPhone: expect.any(String) });

    const reveal = `${base}/deliveries/${r.delivery.id}/contact-reveal`;
    expect((await ctx.http.post(reveal).set(H(support)).send({ reason: 'curto' })).status).toBe(400);
    await ctx.http.post(reveal).set(H(ops)).send({}).expect(400);
    const shown = await ctx.http.post(reveal).set(H(support)).send({ reason: 'cliente ligou perguntando do pedido' });
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);
    expect(shown.body.contact).toMatchObject({ customerFirstName: expect.any(String), customerPhone: expect.any(String), dropoffAddress: expect.stringContaining('Rua Teste') });
    const audit = (await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, r.delivery.id), eq(auditLog.action, 'delivery.contact_revealed'))));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: support.userId, reason: 'cliente ligou perguntando do pedido' });
    expect(JSON.stringify(audit[0])).not.toMatch(/11\d{8,9}/); // a auditoria registra quem e por quê, não o telefone
  });

  it('SEC-144: retenção: contato apagado depois do prazo da corrida terminada (mantém bairro/cidade), corrida ativa nunca; Revelar vazio depois', async () => {
    const done = await readyOrder();
    const active = await readyOrder();
    const m = await courier();
    await ctx.http.post(`${base}/deliveries/${done.delivery.id}/assign`).set(H(ops)).send({ courierId: m.id }).expect(200);
    await act(ops, done.delivery.id, { action: 'cancel', reason: 'cancelada para o teste da retenção' }).expect(200);

    await svc.clearContactDue(new Date(Date.now() + 6 * DAY));
    expect((await dbRow(done.delivery.id)).piiClearedAt).toBeNull(); // ainda dentro do prazo (7 dias)
    expect(await svc.clearContactDue(new Date(Date.now() + 8 * DAY))).toBeGreaterThanOrEqual(1);
    const cleared = await dbRow(done.delivery.id);
    expect(cleared.piiClearedAt).not.toBeNull();
    expect(JSON.stringify(cleared.contact)).not.toMatch(/Rua Teste|11\d{8,9}/);
    expect(cleared.contact).toMatchObject({ dropoffAddress: expect.stringContaining('Francisco Morato') });
    expect((await dbRow(active.delivery.id)).piiClearedAt).toBeNull(); // ativa: nunca
    expect(JSON.stringify((await dbRow(active.delivery.id)).contact)).toContain('Rua Teste');
    expect((await ctx.http.post(`${base}/deliveries/${done.delivery.id}/contact-reveal`).set(H(support)).send({ reason: 'cliente ligou perguntando' })).status).toBe(409);
  });

  // ------------------------------------------------------------------------------------------ SEC-145

  /** Corrida terminada (cancelada) com motoboy, pronta para lançar o custo. */
  async function finishedDelivery(expectedCostCents = 900) {
    const orderId = randomUUID();
    const { delivery } = await ctx.db.transaction((tx) =>
      svc.createInTx(tx, { orderId, storeId: randomUUID(), feeCents: 800, expectedCostCents, volumes: 1, contact: { number: 'WB-AAAAA', kind: 'delivery', storeName: 'Loja', storePhone: null, pickupAddress: 'Rua A, 1, Centro, Francisco Morato', dropoffAddress: 'Rua B, 2, Centro, Francisco Morato', customerFirstName: 'Ana', customerPhone: '11 97777-0000', volumes: 1, note: null } }, sys),
    );
    return delivery;
  }
  const cost = (a: Admin, id: string, body: Record<string, unknown>) => ctx.http.put(`${base}/deliveries/${id}/cost`).set(H(a)).send(body);
  const payout = (a: Admin, ids: string[], extra: Record<string, unknown> = {}) => ctx.http.post(`${base}/deliveries/payouts`).set(H(a)).send({ deliveryIds: ids, paidOn: '2026-11-20', ...extra });
  async function costed(registeredBy: Admin, costCents = 900) {
    const m = await courier();
    const d = await finishedDelivery();
    await ctx.http.post(`${base}/deliveries/${d.id}/assign`).set(H(ops)).send({ courierId: m.id }).expect(200);
    await act(ops, d.id, { action: 'cancel', reason: 'cancelada para o teste do custo' }).expect(200);
    await cost(registeredBy, d.id, { costCents }).expect(200);
    return d;
  }

  it('SEC-145: marcar como pago é do financeiro/super admin; operação recebe 403', async () => {
    const d = await costed(ops);
    expect((await payout(ops, [d.id])).status).toBe(403);
    expect((await payout(support, [d.id])).status).toBe(403);
    const paid = await payout(finance, [d.id]);
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
  });

  it('SEC-145: quem lançou o custo não marca como pago; super admin só com motivo, auditado', async () => {
    const m = await courier();
    const d = await finishedDelivery();
    await ctx.http.post(`${base}/deliveries/${d.id}/assign`).set(H(ops)).send({ courierId: m.id }).expect(200);
    await act(ops, d.id, { action: 'cancel', reason: 'cancelada para o teste do custo' }).expect(200);
    await cost(superAdmin, d.id, { costCents: 900 }).expect(200); // o super admin lançou
    const own = await payout(superAdmin, [d.id]);
    expect(own.status, JSON.stringify(own.body)).toBe(403);
    expect(own.body.code).toBe('SEGREGATION_OF_DUTIES');
    expect((await payout(superAdmin, [d.id], { overrideReason: 'curto' })).status).toBe(400);
    const ok = await payout(superAdmin, [d.id], { overrideReason: 'único administrador no piloto, conferido com o fundador' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const audits = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'delivery.cost_paid'));
    expect(audits.some((a) => (a.after as { segregationOverride?: boolean } | null)?.segregationOverride === true)).toBe(true);
  });

  it('SEC-145: custo muito acima do previsto ou do teto de alerta exige motivo e alerta o financeiro; acima do teto máximo é 422; mostra quem lançou', async () => {
    const m = await courier();
    const make = async () => {
      const d = await finishedDelivery(900);
      await ctx.http.post(`${base}/deliveries/${d.id}/assign`).set(H(ops)).send({ courierId: m.id }).expect(200);
      await act(ops, d.id, { action: 'cancel', reason: 'cancelada para o teste do custo' }).expect(200);
      return d;
    };
    const a = await make();
    const noReason = await cost(ops, a.id, { costCents: 1_400 }); // 1,5x de R$ 9,00 = R$ 13,50
    expect(noReason.status, JSON.stringify(noReason.body)).toBe(422);
    expect(noReason.body.code).toBe('COST_REASON_REQUIRED');
    await cost(ops, a.id, { costCents: 1_350 }).expect(200); // exatamente 1,5x: passa
    const b = await make();
    await cost(ops, b.id, { costCents: 1_400, reason: 'chuva forte e corrida longa fora da faixa' }).expect(200);
    expect((await alerts('delivery_cost_high')).some((d) => d.deliveryId === b.id)).toBe(true);
    expect((await alerts('delivery_cost_high')).some((d) => d.deliveryId === a.id)).toBe(false);
    const c = await make();
    const huge = await cost(ops, c.id, { costCents: 20_000, reason: 'tentando um valor absurdo de corrida' });
    expect(huge.status, JSON.stringify(huge.body)).toBe(422);
    expect(huge.body.code).toBe('COST_ABOVE_LIMIT');
    const detail = (await ctx.http.get(`${base}/deliveries/${b.id}`).set(H(finance)).expect(200)).body;
    expect(detail.costRegisteredBy).toBe(ops.userId);
  });
});
