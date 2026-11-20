import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { DeliveriesService, type DeliveryMessageData } from '../src/modules/logistics/index.js';
import { auditLog, deliveries, deliveryEvents } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs } from './helpers/fixtures.js';

type Admin = Awaited<ReturnType<typeof createAdmin>>;

/** O Drizzle embrulha o erro do Postgres em `Failed query`; a mensagem do banco está em `cause`. */
async function dbRejects(promise: PromiseLike<unknown>, pattern: RegExp): Promise<void> {
  const error = (await promise.then(() => null, (e: unknown) => e)) as { message?: string; cause?: { message?: string } } | null;
  expect(error, 'esperava erro do banco').not.toBeNull();
  expect(`${error?.cause?.message ?? ''} ${error?.message ?? ''}`).toMatch(pattern);
}

/** L.3 (DEC-036): motoboys, corridas, estados, atribuição, WhatsApp, custo, auditoria e permissões. */
describe('Logística da Webag: motoboys e corridas (WB-230 a WB-239)', () => {
  let ctx: TestContext;
  let svc: DeliveriesService;
  let ops: Admin, ops2: Admin, finance: Admin, support: Admin, superAdmin: Admin;
  const storeId = randomUUID();
  const sys = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
  const H = (a: Admin) => bearer(a.accessToken);
  const base = '/v1/admin/logistics';

  const contact = (over: Partial<DeliveryMessageData> = {}): DeliveryMessageData => ({
    number: `WB-${Math.floor(1000 + Math.random() * 8999)}`,
    kind: 'delivery',
    storeName: 'Loja do Zé',
    storePhone: '11 4444-5555',
    pickupAddress: 'Rua A, 10, Centro, Francisco Morato',
    dropoffAddress: 'Rua B, 20, apto 3, Jardim X, Francisco Morato',
    customerFirstName: 'Maria',
    customerPhone: '11 98888-7777',
    volumes: 1,
    note: null,
    ...over,
  });
  const newDelivery = async (over: { contact?: Partial<DeliveryMessageData>; orderId?: string } = {}) => {
    const orderId = over.orderId ?? randomUUID();
    const { delivery, created } = await ctx.db.transaction((tx) => svc.createInTx(tx, { orderId, storeId, feeCents: 800, expectedCostCents: 900, contact: contact(over.contact), volumes: 2, note: 'tocar a campainha' }, { ...sys, principal: null }));
    return { id: delivery.id, orderId, created };
  };
  const courier = async (name = `Moto ${randomUUID().slice(0, 4)}`) => {
    const phone = `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`;
    const res = await ctx.http.post(`${base}/couriers`).set(H(ops)).send({ name, phone, documentsChecked: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; name: string; phone: string };
  };
  const status = (a: Admin, id: string, body: Record<string, unknown>) => ctx.http.post(`${base}/deliveries/${id}/status`).set(H(a)).send(body);
  const assign = (a: Admin, id: string, courierId: string, extra: Record<string, unknown> = {}) => ctx.http.post(`${base}/deliveries/${id}/assign`).set(H(a)).send({ courierId, ...extra });
  const get = async (id: string) => (await ctx.http.get(`${base}/deliveries/${id}`).set(H(ops)).expect(200)).body;
  const dbRow = async (id: string) => (await ctx.db.select().from(deliveries).where(eq(deliveries.id, id)))[0]!;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    svc = ctx.app.get(DeliveriesService);
    [ops, ops2, finance, support, superAdmin] = [await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'support'), await createAdmin(ctx, 'super_admin')];
  });
  afterAll(() => ctx.close());

  describe('motoboys (WB-231)', () => {
    it('perfis: operação cadastra; financeiro e suporte só leem; sem login é 401; sem rota de exclusão', async () => {
      const body = { name: 'João Moto', phone: '(11) 97777-6666', documentsChecked: true };
      await ctx.http.post(`${base}/couriers`).send(body).expect(401);
      await ctx.http.post(`${base}/couriers`).set(H(finance)).send(body).expect(403);
      await ctx.http.post(`${base}/couriers`).set(H(support)).send(body).expect(403);
      const created = await ctx.http.post(`${base}/couriers`).set(H(ops)).send(body).expect(201);
      expect(created.body).toMatchObject({ name: 'João Moto', phone: '5511977776666', active: true });
      await ctx.http.get(`${base}/couriers`).set(H(finance)).expect(200);
      await ctx.http.get(`${base}/couriers`).set(H(support)).expect(200);
      await ctx.http.delete(`${base}/couriers/${created.body.id}`).set(H(superAdmin)).expect(404); // não existe exclusão: só inativar
    });

    it('valida telefone e aceite dos documentos; telefone duplicado entre ativos é 409; inativar libera o número', async () => {
      const post = (over: Record<string, unknown>) => ctx.http.post(`${base}/couriers`).set(H(ops)).send({ name: 'Dup', phone: '11 96666-5555', documentsChecked: true, ...over });
      expect((await post({ phone: '(00) 1234-5678' })).body.code).toBe('COURIER_PHONE_INVALID');
      expect((await post({ documentsChecked: false })).body.code).toBe('COURIER_DOCUMENTS_NOT_CHECKED');
      expect((await post({ name: 'x' })).status).toBe(400);
      expect((await post({ cpf: '12345678901' })).status).toBe(400); // sem CPF no cadastro (minimização)
      const first = await post({}).expect(201);
      const dup = await post({ phone: '(11) 96666-5555' });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('COURIER_PHONE_IN_USE');
      await ctx.http.patch(`${base}/couriers/${first.body.id}`).set(H(ops)).send({ active: false }).expect(200);
      await post({}).expect(201);
    });

    it('lista paginada com busca por nome; inativar com corrida ativa pede para reatribuir (409); auditoria com antes e depois', async () => {
      const a = await courier('Zeca Busca Ativa');
      await courier('Zeca Busca Dois');
      const page = await ctx.http.get(`${base}/couriers`).query({ q: 'zeca busca', limit: '1' }).set(H(ops)).expect(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.nextCursor).not.toBeNull();
      const next = await ctx.http.get(`${base}/couriers`).query({ q: 'zeca busca', limit: '1', cursor: page.body.nextCursor }).set(H(ops)).expect(200);
      expect(next.body.data[0].id).not.toBe(page.body.data[0].id);

      const d = await newDelivery();
      await assign(ops, d.id, a.id).expect(200);
      const busy = await ctx.http.patch(`${base}/couriers/${a.id}`).set(H(ops)).send({ active: false });
      expect(busy.status).toBe(409);
      expect(busy.body.code).toBe('COURIER_HAS_ACTIVE_DELIVERIES');
      expect((await ctx.http.get(`${base}/couriers`).query({ q: 'Zeca Busca Ativa' }).set(H(ops)).expect(200)).body.data[0]).toMatchObject({ busyNow: true });
      await ctx.http.patch(`${base}/couriers/${a.id}`).set(H(ops)).send({ name: 'Zeca Renomeado' }).expect(200);
      const audit = (await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, a.id))).find((r) => r.action === 'courier.update');
      expect(audit).toMatchObject({ before: expect.objectContaining({ name: 'Zeca Busca Ativa' }), after: expect.objectContaining({ name: 'Zeca Renomeado' }) });
    });
  });

  describe('fila e atribuição (WB-230, WB-232)', () => {
    it('uma corrida por pedido (toque duplo não cria duas); fila: a mais antiga primeiro, com SLA, filtros e paginação', async () => {
      const orderId = randomUUID();
      const first = await newDelivery({ orderId });
      const again = await newDelivery({ orderId });
      expect(first.created).toBe(true);
      expect(again).toMatchObject({ created: false, id: first.id });

      const old = await newDelivery();
      const older = await newDelivery();
      await ctx.db.update(deliveries).set({ readyAt: new Date(Date.now() - 25 * 60_000) }).where(eq(deliveries.id, older.id)); // atrasada
      await ctx.db.update(deliveries).set({ readyAt: new Date(Date.now() - 12 * 60_000) }).where(eq(deliveries.id, old.id)); // espera longa
      const list = await ctx.http.get(`${base}/deliveries`).query({ storeId, status: 'ready_for_collection', limit: '50' }).set(H(support)).expect(200);
      const ids = (list.body.data as { id: string }[]).map((d) => d.id);
      expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(old.id));
      expect(ids.indexOf(old.id)).toBeLessThan(ids.indexOf(first.id));
      const bySla = Object.fromEntries((list.body.data as { id: string; sla: string }[]).map((d) => [d.id, d.sla]));
      expect(bySla[older.id]).toBe('late');
      expect(bySla[old.id]).toBe('long');
      expect(bySla[first.id]).toBe('ok');
      // paginação por cursor sem repetir
      const p1 = await ctx.http.get(`${base}/deliveries`).query({ storeId, limit: '2' }).set(H(ops)).expect(200);
      const p2 = await ctx.http.get(`${base}/deliveries`).query({ storeId, limit: '2', cursor: p1.body.nextCursor }).set(H(ops)).expect(200);
      expect(p1.body.data.map((d: { id: string }) => d.id)).not.toEqual(expect.arrayContaining(p2.body.data.map((d: { id: string }) => d.id)));
    });

    it('dois operadores atribuindo a mesma corrida: vale o primeiro, o outro vê 409 com o motoboy', async () => {
      const [a, b, d] = [await courier(), await courier(), await newDelivery()];
      const [r1, r2] = await Promise.all([assign(ops, d.id, a.id), assign(ops2, d.id, b.id)]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const loser = [r1, r2].find((r) => r.status === 409)!;
      expect(loser.body.code).toBe('DELIVERY_ALREADY_ASSIGNED');
      expect(loser.body.detail).toMatch(/Já atribuído a/);
      expect((await get(d.id)).status).toBe('awaiting_courier');
    });

    it('motoboy inativo não é atribuível; endereço incompleto exige "já confirmei"; atribuir a quem já tem corrida avisa o total', async () => {
      const inactive = await courier();
      await ctx.http.patch(`${base}/couriers/${inactive.id}`).set(H(ops)).send({ active: false }).expect(200);
      const d1 = await newDelivery();
      expect((await assign(ops, d1.id, inactive.id)).body.code).toBe('COURIER_INACTIVE');

      const bad = await newDelivery({ contact: { dropoffAddress: 'Rua B, Francisco Morato' } });
      const m = await courier();
      expect((await assign(ops, bad.id, m.id)).body.code).toBe('ADDRESS_INCOMPLETE');
      await assign(ops, bad.id, m.id, { addressConfirmed: true }).expect(200);

      const d2 = await newDelivery();
      await assign(ops, d2.id, m.id).expect(200);
      const wa = await ctx.http.get(`${base}/deliveries/${d2.id}/whatsapp`).set(H(ops)).expect(200);
      expect(wa.body.courierActiveDeliveries).toBe(2);
    });

    it('WhatsApp: só com motoboy; mensagem do modelo, sem CPF/e-mail/itens/valores/código; link wa.me; envio registrado', async () => {
      const d = await newDelivery();
      expect((await ctx.http.get(`${base}/deliveries/${d.id}/whatsapp`).set(H(ops))).body.code).toBe('DELIVERY_NOT_ASSIGNED');
      const m = await courier();
      await assign(ops, d.id, m.id).expect(200);
      const code = (await dbRow(d.id)).deliveryCode!;
      await ctx.http.get(`${base}/deliveries/${d.id}/whatsapp`).set(H(finance)).expect(403); // SEC-144: a mensagem leva o contato do cliente
      const wa = (await ctx.http.get(`${base}/deliveries/${d.id}/whatsapp`).set(H(ops)).expect(200)).body;
      expect(wa.courierPhone).toBe(m.phone);
      expect(wa.message).toContain('COLETA: Loja do Zé, Rua A, 10, Centro, Francisco Morato');
      expect(wa.message).toContain('ENTREGA: Rua B, 20, apto 3, Jardim X, Francisco Morato. Cliente: Maria, 11 98888-7777');
      expect(wa.message).toContain('Volumes: 2. Obs.: tocar a campainha');
      expect(wa.message).toContain('Pagamento: pago no app. Não cobrar do cliente.');
      expect(wa.message).not.toMatch(/R\$|@|cpf/i);
      expect(wa.message).not.toContain(code); // o código é do cliente: nunca na mensagem
      expect(wa.link.startsWith(`https://wa.me/${m.phone}?text=`)).toBe(true);
      await ctx.http.post(`${base}/deliveries/${d.id}/whatsapp-sent`).set(H(support)).expect(403);
      await ctx.http.post(`${base}/deliveries/${d.id}/whatsapp-sent`).set(H(ops)).expect(204);
      expect((await get(d.id)).whatsappSentAt).not.toBeNull();
    });
  });

  describe('estados, código de entrega e falhas (WB-233, WB-234)', () => {
    it('fluxo completo com linha do tempo e auditoria; transição inválida é 409; só operação e super admin agem', async () => {
      const m = await courier();
      const d = await newDelivery();
      expect((await status(ops, d.id, { action: 'picked_up' })).body.code).toBe('INVALID_DELIVERY_TRANSITION'); // não pula o motoboy
      await assign(ops, d.id, m.id).expect(200);
      await status(finance, d.id, { action: 'confirm' }).expect(403);
      await status(support, d.id, { action: 'confirm' }).expect(403);
      expect((await status(ops, d.id, { action: 'confirm' })).body.status).toBe('courier_en_route');
      expect((await status(ops, d.id, { action: 'picked_up' })).body.status).toBe('out_for_delivery');
      const code = (await dbRow(d.id)).deliveryCode!;
      expect(JSON.stringify(await get(d.id))).not.toContain(code); // o painel nunca recebe o código
      const delivered = await status(ops, d.id, { action: 'delivered', code });
      expect(delivered.body.status).toBe('delivered');
      const detail = await get(d.id);
      expect(detail.timeline.map((e: { to: string }) => e.to)).toEqual(['ready_for_collection', 'awaiting_courier', 'courier_en_route', 'out_for_delivery', 'delivered']);
      expect(detail.contact).toBeUndefined(); // depois de concluída, sem dado pessoal do cliente (LGPD)
      expect(detail.destination).toBe('Jardim X, Francisco Morato');
      expect((await status(ops, d.id, { action: 'cancel', reason: 'tarde demais' })).body.code).toBe('INVALID_DELIVERY_TRANSITION'); // terminal
      const audits = (await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, d.id))).map((a) => a.action);
      expect(audits).toEqual(expect.arrayContaining(['delivery.create', 'delivery.assign', 'delivery.confirm', 'delivery.picked_up', 'delivery.delivered']));
    });

    it('código de entrega: errado não conclui; 5 erros bloqueiam (429); só o super admin conclui com motivo', async () => {
      const m = await courier();
      const d = await newDelivery();
      await assign(ops, d.id, m.id);
      await status(ops, d.id, { action: 'confirm' });
      await status(ops, d.id, { action: 'picked_up' });
      const real = (await dbRow(d.id)).deliveryCode!;
      const wrong = real === '0000' ? '1111' : '0000';
      expect((await status(ops, d.id, { action: 'delivered' })).body.code).toBe('DELIVERY_CODE_INVALID'); // sem código
      for (let n = 0; n < 4; n++) expect((await status(ops, d.id, { action: 'delivered', code: wrong })).body.code).toBe('DELIVERY_CODE_INVALID');
      const locked = await status(ops, d.id, { action: 'delivered', code: real });
      expect(locked.status).toBe(429);
      expect(locked.body.code).toBe('DELIVERY_CODE_LOCKED');
      expect((await status(ops, d.id, { action: 'delivered', overrideReason: 'cliente sem celular, confirmado por telefone' })).body.code).toBe('SUPER_ADMIN_REQUIRED');
      const done = await status(superAdmin, d.id, { action: 'delivered', overrideReason: 'cliente sem celular, confirmado por telefone' });
      expect(done.body.status).toBe('delivered');
      expect((await ctx.db.select().from(deliveryEvents).where(eq(deliveryEvents.deliveryId, d.id))).find((e) => e.action === 'delivered')?.meta).toMatchObject({ codeOverrideReason: 'cliente sem celular, confirmado por telefone' });
    });

    it('reatribuir exige motivo, volta à fila mantendo o horário de "pronto" e libera o motoboy', async () => {
      const [a, b, d] = [await courier(), await courier(), await newDelivery()];
      const readyAt = (await dbRow(d.id)).readyAt;
      await assign(ops, d.id, a.id);
      expect((await status(ops, d.id, { action: 'reassign' })).status).toBe(400);
      const back = await status(ops, d.id, { action: 'reassign', reason: 'motoboy sem resposta' });
      expect(back.body).toMatchObject({ status: 'ready_for_collection', courier: null });
      expect((await dbRow(d.id)).readyAt.getTime()).toBe(readyAt.getTime());
      await assign(ops, d.id, b.id).expect(200);
      expect((await get(d.id)).courier.id).toBe(b.id);
    });

    it('não entregue: motivo obrigatório; 1 reentrega, depois só devolução à loja; "falha da loja" fica registrada', async () => {
      const m = await courier();
      const d = await newDelivery();
      await assign(ops, d.id, m.id);
      await status(ops, d.id, { action: 'confirm' });
      await status(ops, d.id, { action: 'picked_up' });
      expect((await status(ops, d.id, { action: 'not_delivered' })).status).toBe(400);
      expect((await status(ops, d.id, { action: 'not_delivered', failReason: 'other' })).status).toBe(400); // "outro" exige texto
      const failed = await status(ops, d.id, { action: 'not_delivered', failReason: 'customer_absent' });
      expect(failed.body).toMatchObject({ status: 'not_delivered', failReason: 'customer_absent' });
      expect((await status(ops, d.id, { action: 'reattempt' })).body).toMatchObject({ status: 'out_for_delivery', attempts: 2 });
      await status(ops, d.id, { action: 'not_delivered', failReason: 'store_fault', reason: 'pedido não estava pronto' });
      expect((await status(ops, d.id, { action: 'reattempt' })).body.code).toBe('REATTEMPT_LIMIT');
      expect((await status(ops, d.id, { action: 'return_confirmed' })).body.status).toBe('returned_to_store');
      const events = await ctx.db.select().from(deliveryEvents).where(eq(deliveryEvents.deliveryId, d.id));
      expect(events.find((e) => e.reason === 'pedido não estava pronto')?.meta).toMatchObject({ failReason: 'store_fault', storeFault: true });
    });

    it('cancelar corrida exige motivo; o histórico é append-only no banco', async () => {
      const d = await newDelivery();
      expect((await status(ops, d.id, { action: 'cancel' })).status).toBe(400);
      expect((await status(ops, d.id, { action: 'cancel', reason: 'pedido cancelado pelo cliente' })).body.status).toBe('cancelled');
      await dbRejects(ctx.db.execute(sql`update delivery_events set action = 'x' where delivery_id = ${d.id}`), /append-only/);
      await dbRejects(ctx.db.execute(sql`delete from delivery_events where delivery_id = ${d.id}`), /append-only/);
    });
  });

  describe('custo por entrega e pagamento ao motoboy (WB-239)', () => {
    it('custo só com a corrida terminada; correção exige motivo e guarda o valor anterior; lote de um motoboy; pago não se edita', async () => {
      const [a, b] = [await courier(), await courier()];
      const finish = async (m: { id: string }, reason?: string) => {
        const d = await newDelivery();
        await assign(ops, d.id, m.id);
        if (reason) return d;
        await status(ops, d.id, { action: 'cancel', reason: 'cancelada para teste do custo' });
        return d;
      };
      const open = await newDelivery();
      expect((await ctx.http.put(`${base}/deliveries/${open.id}/cost`).set(H(ops)).send({ costCents: 900 })).body.code).toBe('DELIVERY_NOT_FINISHED');

      const [d1, d2, d3] = [await finish(a), await finish(a), await finish(b)];
      await ctx.http.put(`${base}/deliveries/${d1.id}/cost`).set(H(finance)).send({ costCents: 900 }).expect(403); // financeiro lê, não registra
      expect((await ctx.http.put(`${base}/deliveries/${d1.id}/cost`).set(H(ops)).send({ costCents: 900 }).expect(200)).body.cost).toEqual({ amount: 900, currency: 'BRL' });
      expect((await ctx.http.put(`${base}/deliveries/${d1.id}/cost`).set(H(ops)).send({ costCents: 1_000 })).status).toBe(400); // correção sem motivo
      await ctx.http.put(`${base}/deliveries/${d1.id}/cost`).set(H(ops)).send({ costCents: 1_000, reason: 'motoboy esperou 20 min' }).expect(200);
      const ev = (await ctx.db.select().from(deliveryEvents).where(eq(deliveryEvents.deliveryId, d1.id))).find((e) => e.action === 'cost_corrected');
      expect(ev?.meta).toMatchObject({ previousCostCents: 900, costCents: 1_000 });
      await ctx.http.put(`${base}/deliveries/${d2.id}/cost`).set(H(ops)).send({ costCents: 800 }).expect(200);
      await ctx.http.put(`${base}/deliveries/${d3.id}/cost`).set(H(ops)).send({ costCents: 700 }).expect(200);

      expect((await ctx.http.post(`${base}/deliveries/payouts`).set(H(finance)).send({ deliveryIds: [d1.id, d3.id], paidOn: '2026-11-20' })).body.code).toBe('PAYOUT_MIXED_COURIERS');
      const paid = await ctx.http.post(`${base}/deliveries/payouts`).set(H(finance)).send({ deliveryIds: [d1.id, d2.id], paidOn: '2026-11-20' }).expect(200);
      expect(paid.body).toEqual({ count: 2, total: { amount: 1_800, currency: 'BRL' } });
      expect((await ctx.http.post(`${base}/deliveries/payouts`).set(H(finance)).send({ deliveryIds: [d1.id], paidOn: '2026-11-21' })).body.code).toBe('COST_ALREADY_PAID');
      expect((await ctx.http.put(`${base}/deliveries/${d1.id}/cost`).set(H(ops)).send({ costCents: 1, reason: 'depois de pago' })).body.code).toBe('COST_ALREADY_PAID');
    });
  });
});
