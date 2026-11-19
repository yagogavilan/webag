import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { auditLog, orders } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, cartView, customerAt, orderRow, shopWith } from './helpers/orders.js';

/** WB-121 / DEC-073: modo manutenção. Para as vendas novas; leitura, pedidos em andamento e webhooks seguem; auditado; só o super admin liga. */
describe('Modo manutenção (WB-121)', () => {
  let ctx: TestContext;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;
  let operations: Awaited<ReturnType<typeof createAdmin>>;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    superAdmin = await createAdmin(ctx, 'super_admin');
    operations = await createAdmin(ctx, 'operations');
  });
  afterAll(async () => {
    await ctx.http.put('/v1/admin/maintenance').set(bearer(superAdmin.accessToken)).send({ enabled: false, reason: 'fim do teste' });
    await ctx.close();
  });
  const set = (body: Record<string, unknown>, who = superAdmin) => ctx.http.put('/v1/admin/maintenance').set(bearer(who.accessToken)).send(body);

  it('nasce desligado; o endpoint público não pede login; todo perfil de admin vê o estado, só o super admin muda (motivo obrigatório)', async () => {
    expect((await ctx.http.get('/v1/config/maintenance').expect(200)).body).toEqual({ active: false, message: null, expectedBackAt: null });
    expect((await ctx.http.get('/v1/admin/maintenance').set(bearer(operations.accessToken)).expect(200)).body).toMatchObject({ active: false });
    await ctx.http.get('/v1/admin/maintenance').expect(401);
    expect((await set({ enabled: true, reason: 'atualização do banco' }, operations)).status).toBe(403);
    expect((await set({ enabled: true })).status).toBe(400); // sem motivo
    expect((await set({ enabled: true, reason: 'x' })).status).toBe(400);
    expect((await set({ enabled: true, message: 'ok', reason: 'atualização do banco' })).status).toBe(400); // mensagem curta
    const past = await set({ enabled: true, expectedBackAt: new Date(Date.now() - 60_000).toISOString(), reason: 'atualização do banco' });
    expect(past.status).toBe(400);
    expect((await ctx.http.get('/v1/config/maintenance').expect(200)).body.active).toBe(false); // nada mudou
  });

  it('ligada: pedido novo e intenção de cartão voltam 503 MAINTENANCE com mensagem amigável; leitura, sacola e pedido em andamento seguem; desligar volta tudo', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Manutenção', priceCents: 4_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);

    // Um pedido já criado (aguardando pagamento) antes da manutenção; a repetição dele pela mesma chave também precisa seguir.
    const key = randomUUID();
    const firstView = await cartView(ctx, buyer.user, buyer.addressId);
    const firstBody = { mode: 'delivery', addressId: buyer.addressId, cartRevision: firstView.revision, expectedTotalCents: firstView.totalCents, paymentMethod: 'pix' };
    const before = await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', key).send(firstBody);
    expect(before.status).toBe(201);
    const inFlight = before.body.id as string;

    const back = new Date(Date.now() + 3_600_000).toISOString();
    const on = await set({ enabled: true, message: 'Estamos atualizando o sistema. Voltamos às 16h.', expectedBackAt: back, reason: 'atualização do banco de dados' });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(on.body).toMatchObject({ active: true, message: 'Estamos atualizando o sistema. Voltamos às 16h.', expectedBackAt: back, updatedByName: expect.any(String) });
    expect((await ctx.http.get('/v1/config/maintenance').expect(200)).body).toMatchObject({ active: true, message: 'Estamos atualizando o sistema. Voltamos às 16h.', expectedBackAt: back });

    // Pedido novo: 503 com `code`, `detail` pt-BR, previsão e Retry-After.
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200); // a sacola continua funcionando
    const view = await cartView(ctx, buyer.user, buyer.addressId);
    const refused = await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'delivery', addressId: buyer.addressId, cartRevision: view.revision, expectedTotalCents: view.totalCents, paymentMethod: 'pix' });
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({ code: 'MAINTENANCE', status: 503, detail: 'Estamos atualizando o sistema. Voltamos às 16h.', expectedBackAt: back });
    expect(refused.headers['content-type']).toContain('application/problem+json');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    const intent = await ctx.http.post('/v1/card-intents').set(bearer(buyer.user.accessToken)).send({ mode: 'delivery', addressId: buyer.addressId, cartRevision: view.revision, expectedTotalCents: view.totalCents });
    expect(intent.status).toBe(503);
    expect(intent.body.code).toBe('MAINTENANCE');

    // Leitura continua (home, loja, sacola, lista de pedidos) e o admin segue acessível.
    await ctx.http.get(`/v1/browse/stores/${shop.store.id}?lat=${shop.origin.lat}&lng=${shop.origin.lng}`).expect(200);
    await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200);
    await ctx.http.get('/v1/orders').set(bearer(buyer.user.accessToken)).expect(200);
    await ctx.http.get('/v1/admin/parameters').set(bearer(superAdmin.accessToken)).expect(200);

    // Pedido em andamento segue: o PIX do pedido criado antes é aprovado e o pedido vira "recebido"; a repetição da mesma chave devolve o pedido (200).
    await approve(ctx, buyer.user, (await attemptOf(ctx, inFlight)).id);
    expect((await orderRow(ctx, inFlight)).status).toBe('received');
    const replay = await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', key).send(firstBody);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(inFlight);
    await ctx.http.post(`/v1/stores/${shop.store.id}/orders/${inFlight}/accept`).set(bearer(shop.store.owner.accessToken)).expect(200); // a loja continua operando

    // O webhook do provedor continua sendo recebido (WB-121 C2): sem assinatura vale o 4xx do webhook, nunca o 503 da manutenção.
    const hook = await ctx.http.post('/v1/webhooks/fake?data.id=123&type=payment').send({ type: 'payment', data: { id: '123' } });
    expect(hook.status).not.toBe(503);

    // Desligar: volta tudo, sem ação do usuário (o mesmo carrinho vira pedido).
    const off = await set({ enabled: false, reason: 'atualização concluída' });
    expect(off.body).toMatchObject({ active: false, message: null, expectedBackAt: null });
    expect((await ctx.http.get('/v1/config/maintenance').expect(200)).body.active).toBe(false);
    const view2 = await cartView(ctx, buyer.user, buyer.addressId);
    const again = await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'delivery', addressId: buyer.addressId, cartRevision: view2.revision, expectedTotalCents: view2.totalCents, paymentMethod: 'pix' });
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect((await ctx.db.select().from(orders).where(eq(orders.id, again.body.id))).length).toBe(1);
  });

  it('a mensagem padrão vale sem texto; ligar e desligar vão para a auditoria com motivo, antes e depois e o ator', async () => {
    await set({ enabled: true, reason: 'janela de manutenção noturna' }).expect(200);
    const status = (await ctx.http.get('/v1/config/maintenance').expect(200)).body;
    expect(status.active).toBe(true);
    expect(status.message).toMatch(/manutenção/i);
    expect(status.expectedBackAt).toBeNull();
    await set({ enabled: false, reason: 'janela encerrada' }).expect(200);

    const rows = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetType, 'platform'), eq(auditLog.targetId, 'maintenance')));
    const enable = rows.find((r) => r.action === 'maintenance.enable' && r.reason === 'janela de manutenção noturna');
    const disable = rows.find((r) => r.action === 'maintenance.disable' && r.reason === 'janela encerrada');
    expect(enable).toMatchObject({ actorId: superAdmin.userId, before: { enabled: false }, after: { enabled: true } });
    expect(disable).toMatchObject({ actorId: superAdmin.userId, before: { enabled: true }, after: { enabled: false } });
  });
});
