import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { CommissionService } from '../src/modules/finance/index.js';
import { maskPhone } from '../src/modules/logistics/logistics.controllers.js';
import { deliveries, exchangeRequests, orderItems, orders, productVariants, storeMembers, userRoles } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith, type Shop } from './helpers/orders.js';

type Evt = { event: string; payload: Record<string, unknown> };

describe('Lacunas de contrato da Onda 6 (O6.2)', () => {
  let ctx: TestContext;
  let url: string;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen(0, '127.0.0.1');
    url = `${await ctx.app.getUrl()}/rt`;
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await ctx.close();
  });

  const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
  async function connectTicket(ticket: string): Promise<{ socket: Socket; events: Evt[] }> {
    const socket = io(url, { auth: { ticket }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    const events: Evt[] = [];
    socket.onAny((event: string, payload: Record<string, unknown>) => void events.push({ event, payload }));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (e) => reject(e));
    });
    return { socket, events };
  }
  const tryTicket = (ticket: string) => connectTicket(ticket).then(() => 'connected', (e: Error) => e.message);
  const waitFor = async (events: Evt[], name: string, timeout = 3_000): Promise<Evt> => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = events.find((e) => e.event === name);
      if (found) return found;
      await settle(25);
    }
    throw new Error(`evento ${name} não chegou; recebidos: ${events.map((e) => e.event).join(',')}`);
  };
  const issue = (token: string, body: Record<string, unknown>) => ctx.http.post('/v1/realtime/tickets').set(bearer(token)).send(body);

  describe('POST /v1/realtime/tickets', () => {
    it('ticket de uso único: abre o socket uma vez, a 2ª tentativa e o ticket inventado são recusados; vale 60 s; exige login', async () => {
      await ctx.http.post('/v1/realtime/tickets').send({ scope: 'user' }).expect(401);
      const user = await createCustomer(ctx);
      const res = await issue(user.accessToken, { scope: 'user' }).expect(200);
      expect(res.body).toMatchObject({ expiresInSeconds: 60 });
      expect(res.body.ticket).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      const ttl = await ctx.redis.ttl(`rt:ticket:${(await import('../src/platform/crypto/crypto.js')).sha256Hex(res.body.ticket as string)}`);
      expect(ttl).toBeGreaterThan(50);
      expect(ttl).toBeLessThanOrEqual(60);
      expect(await tryTicket(res.body.ticket as string)).toBe('connected');
      expect(await tryTicket(res.body.ticket as string)).toBe('unauthenticated'); // uso único
      expect(await tryTicket('ticket-inventado-0000000000000000')).toBe('unauthenticated');
      // Duas conexões simultâneas com o MESMO ticket: só uma entra.
      const second = (await issue(user.accessToken, { scope: 'user' }).expect(200)).body.ticket as string;
      const both = await Promise.all([tryTicket(second), tryTicket(second)]);
      expect(both.sort()).toEqual(['connected', 'unauthenticated']);
    });

    it('ticket vencido e ticket de sessão revogada não abrem o socket', async () => {
      const user = await createCustomer(ctx);
      const ticket = (await issue(user.accessToken, { scope: 'user' }).expect(200)).body.ticket as string;
      await ctx.redis.flushdb(); // simula o vencimento (o Redis apaga a chave ao fim do TTL)
      expect(await tryTicket(ticket)).toBe('unauthenticated');
      const fresh = (await issue(user.accessToken, { scope: 'user' }).expect(200)).body.ticket as string;
      await ctx.http.post('/v1/auth/logout').set(bearer(user.accessToken)).send({ refreshToken: user.refreshToken }).expect(204);
      expect(await tryTicket(fresh)).toBe('unauthenticated');
    });

    it('escopo de loja: só membro com permissão de pedidos (404 para outro, sem revelar a loja); recebe SÓ as salas da loja pedida', async () => {
      const shop: Shop = await shopWith(ctx, [{ name: 'Item T1', priceCents: 5_000, stock: 20 }]);
      const otherShop = await shopWith(ctx, [{ name: 'Item T2', priceCents: 5_000, stock: 20 }]);
      const owner = shop.store.owner;
      await issue(owner.accessToken, { scope: 'store' }).expect(400); // falta a loja
      await issue(owner.accessToken, { scope: 'store', storeId: otherShop.store.id }).expect(404);
      await issue(owner.accessToken, { scope: 'store', storeId: randomUUID() }).expect(404);
      await issue(owner.accessToken, { scope: 'user', storeId: shop.store.id }).expect(400);
      const stranger = await createCustomer(ctx);
      await issue(stranger.accessToken, { scope: 'store', storeId: shop.store.id }).expect(404);
      await issue(owner.accessToken, { scope: 'store', storeId: shop.store.id, extra: 1 }).expect(400);

      const ticket = (await issue(owner.accessToken, { scope: 'store', storeId: shop.store.id }).expect(200)).body.ticket as string;
      const { events } = await connectTicket(ticket);
      const ownerOfOther = await connectTicket((await issue(otherShop.store.owner.accessToken, { scope: 'store', storeId: otherShop.store.id }).expect(200)).body.ticket as string);
      // Cliente com ticket "user" NÃO recebe o aviso de pedido novo da loja.
      const buyer = await customerAt(ctx, shop.origin);
      const buyerSocket = await connectTicket((await issue(buyer.user.accessToken, { scope: 'user' }).expect(200)).body.ticket as string);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      expect((await waitFor(events, 'order.created')).payload).toMatchObject({ orderId: created.id });
      await waitFor(buyerSocket.events, 'order.status_changed');
      expect(buyerSocket.events.some((e) => e.event === 'order.created')).toBe(false);
      expect(ownerOfOther.events).toEqual([]);

      // Funcionário sem a permissão de pedidos: 404 na emissão.
      const staff = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: shop.store.id, userId: staff.userId, role: 'staff', permissions: ['catalog'] });
      await issue(staff.accessToken, { scope: 'store', storeId: shop.store.id }).expect(404);
    });

    it('escopo de admin: só perfil de operação com 2º fator feito; cliente e financeiro sem a permissão recebem 403', async () => {
      const customer = await createCustomer(ctx);
      await issue(customer.accessToken, { scope: 'admin' }).expect(403);
      const ops = await createAdmin(ctx, 'operations');
      const ticket = (await issue(ops.accessToken, { scope: 'admin' }).expect(200)).body.ticket as string;
      const { events } = await connectTicket(ticket);
      const shop = await shopWith(ctx, [{ name: 'Item T3', priceCents: 5_000, stock: 20 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      await ctx.http.post(`/v1/stores/${shop.store.id}/orders/${created.id}/accept`).set(bearer(shop.store.owner.accessToken)).expect(200);
      await ctx.http.post(`/v1/stores/${shop.store.id}/orders/${created.id}/status`).set(bearer(shop.store.owner.accessToken)).send({ status: 'ready_for_collection', volumes: 1 }).expect(200);
      expect((await waitFor(events, 'delivery_ready')).payload).toMatchObject({ orderId: created.id });
    });
  });

  describe('commissionPct na API da loja', () => {
    it('dono vê a comissão efetiva e a origem (padrão, categoria, loja); funcionário não vê o financeiro (RN-13)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item C1', priceCents: 5_000, stock: 5 }]);
      const owner = shop.store.owner;
      await ctx.db.insert(userRoles).values({ userId: owner.userId, role: 'merchant' });
      const mine = async () => (await ctx.http.get('/v1/stores/mine').set(bearer(owner.accessToken)).expect(200)).body.data[0];
      expect(await mine()).toMatchObject({ commissionPct: 10, commissionSource: 'default', commissionCategories: expect.any(Array) });
      // (taxas por categoria são globais: outros testes criam as suas; aqui só o formato importa)
      const detail = (await ctx.http.get(`/v1/stores/${shop.store.id}`).set(bearer(owner.accessToken)).expect(200)).body;
      expect(detail).toMatchObject({ commissionPct: 10, commissionSource: 'default' });

      await ctx.app.get(CommissionService).setStoreRate(shop.store.id, { pctBp: 1250, reason: 'Acordo comercial' }, null);
      expect(await mine()).toMatchObject({ commissionPct: 12.5, commissionSource: 'store', commissionCategories: [] });

      const staff = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: shop.store.id, userId: staff.userId, role: 'staff', permissions: ['catalog'] });
      const seen = (await ctx.http.get(`/v1/stores/${shop.store.id}`).set(bearer(staff.accessToken)).expect(200)).body;
      expect(seen).toMatchObject({ commissionPct: null, commissionSource: null, commissionCategories: [] });
    });
  });

  describe('série de vendas por dia', () => {
    it('um ponto por dia (zero onde não vendeu), soma igual ao total de vendas, só com a permissão de valores', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item V1', priceCents: 10_000, stock: 20 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 2).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      const [paid] = await ctx.db.select().from(orders).where(eq(orders.id, created.id));
      // Move o pagamento para 2 dias atrás (data civil de Brasília) e cria outro pedido pago hoje.
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
      await ctx.db.update(orders).set({ paidAt: twoDaysAgo }).where(eq(orders.id, created.id));
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const second = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, second.id)).id);

      const day = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
      const from = day(new Date(Date.now() - 3 * 86_400_000));
      const to = day(new Date());
      const owner = shop.store.owner;
      const series = (await ctx.http.get(`/v1/stores/${shop.store.id}/finance/sales/daily?from=${from}&to=${to}`).set(bearer(owner.accessToken)).expect(200)).body;
      expect(series).toMatchObject({ timezone: 'America/Sao_Paulo', period: { from, to } });
      expect(series.data.map((p: { date: string }) => p.date)).toEqual([from, day(new Date(Date.now() - 2 * 86_400_000)), day(new Date(Date.now() - 86_400_000)), to]);
      const byDate = new Map<string, { orders: number; gross: { amount: number } }>(series.data.map((p: { date: string; orders: number; gross: { amount: number } }) => [p.date, p]));
      expect(byDate.get(from)).toMatchObject({ orders: 0, gross: { amount: 0, currency: 'BRL' } });
      expect(byDate.get(day(twoDaysAgo))).toMatchObject({ orders: 1, gross: { amount: paid!.subtotalCents - paid!.storeCouponCents } });
      expect(byDate.get(to)!.orders).toBe(1);
      const total = (await ctx.http.get(`/v1/stores/${shop.store.id}/finance/sales?from=${from}&to=${to}`).set(bearer(owner.accessToken)).expect(200)).body;
      expect(series.data.reduce((a: number, p: { gross: { amount: number } }) => a + p.gross.amount, 0)).toBe(total.gross.amount);
      expect(series.data.reduce((a: number, p: { orders: number }) => a + p.orders, 0)).toBe(total.orders);

      // Permissões: sem login 401; funcionário sem `sales_values` e dono de outra loja não leem (404).
      await ctx.http.get(`/v1/stores/${shop.store.id}/finance/sales/daily?from=${from}&to=${to}`).expect(401);
      const other = await shopWith(ctx, [{ name: 'Item V2', priceCents: 1_000, stock: 5 }]);
      await ctx.http.get(`/v1/stores/${shop.store.id}/finance/sales/daily?from=${from}&to=${to}`).set(bearer(other.store.owner.accessToken)).expect(404);
      const staff = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: shop.store.id, userId: staff.userId, role: 'staff', permissions: ['catalog'] });
      await ctx.http.get(`/v1/stores/${shop.store.id}/finance/sales/daily?from=${from}&to=${to}`).set(bearer(staff.accessToken)).expect(403);
      // Validação do período.
      await ctx.http.get(`/v1/stores/${shop.store.id}/finance/sales/daily?from=${to}&to=${from}`).set(bearer(owner.accessToken)).expect(400);
      await ctx.http.get(`/v1/stores/${shop.store.id}/finance/sales/daily?from=2024-01-01&to=2026-01-01`).set(bearer(owner.accessToken)).expect(400);
    });
  });

  describe('telefone mascarado da corrida', () => {
    it('(11) 9****-7777; número inválido não vaza', () => {
      expect(maskPhone('11988887777')).toBe('(11) 9****-7777');
      expect(maskPhone('(11) 98888-7777')).toBe('(11) 9****-7777');
      expect(maskPhone('123')).toBeNull();
      expect(maskPhone(null)).toBeNull();
    });
  });

  describe('trocas no admin: lista, detalhe e isenção da taxa (AT3/M3)', () => {
    async function awaitingFee() {
      const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 20 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      const [order] = await ctx.db.select().from(orders).where(eq(orders.id, created.id));
      await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7, deliverySnapshot: { ...(order!.deliverySnapshot ?? {}), exchangeFeeCents: 900, expectedCostCents: 700 } }).where(eq(orders.id, created.id));
      const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, created.id));
      const [variant] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!));
      const [sizeM] = await ctx.db.insert(productVariants).values({ productId: variant!.productId, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
      const ex = (await ctx.http.post(`/v1/orders/${created.id}/exchanges`).set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: item!.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: sizeM!.id }).expect(201)).body as { id: string };
      await ctx.http.post(`/v1/stores/${shop.store.id}/exchanges/${ex.id}/accept`).set(bearer(shop.store.owner.accessToken)).send({}).expect(200);
      return { shop, buyer, exchangeId: ex.id, orderId: created.id };
    }

    it('suporte lê, só operação e super admin isentam; isentar libera a coleta; repetir é 409; taxa paga não isenta', async () => {
      const support = await createAdmin(ctx, 'support');
      const ops = await createAdmin(ctx, 'operations');
      const finance = await createAdmin(ctx, 'finance');
      const d = await awaitingFee();
      const get = (token: string, path = '') => ctx.http.get(`/v1/admin/exchange-requests${path}`).set(bearer(token));

      await ctx.http.get('/v1/admin/exchange-requests').expect(401);
      await ctx.http.get('/v1/admin/exchange-requests').set(bearer(d.buyer.user.accessToken)).expect(403);
      const list = (await get(support.accessToken, `?status=awaiting_fee&storeId=${d.shop.store.id}`).expect(200)).body;
      expect(list.data).toHaveLength(1);
      expect(list.data[0]).toMatchObject({ id: d.exchangeId, status: 'awaiting_fee', storeId: d.shop.store.id, fee: { amount: 900 } });
      expect(JSON.stringify(list)).not.toContain(d.buyer.user.email);
      const byNumber = (await get(finance.accessToken, `?q=${list.data[0].number.toLowerCase()}`).expect(200)).body;
      expect(byNumber.data.map((e: { id: string }) => e.id)).toEqual([d.exchangeId]);
      await get(support.accessToken, '?status=inventado').expect(400);
      const detail = (await get(support.accessToken, `/${d.exchangeId}`).expect(200)).body;
      expect(detail).toMatchObject({ id: d.exchangeId, status: 'awaiting_fee', storeCode: null });
      expect(detail.timeline.length).toBeGreaterThan(0);
      await get(support.accessToken, `/${randomUUID()}`).expect(404);
      await get(support.accessToken, '/nao-uuid').expect(404);

      const waive = (token: string, id: string, reason = 'Cliente ligou: coleta falhou antes') => ctx.http.post(`/v1/admin/exchange-requests/${id}/waive-fee`).set(bearer(token)).send({ reason });
      await waive(support.accessToken, d.exchangeId).expect(403);
      await waive(finance.accessToken, d.exchangeId).expect(403);
      await waive(ops.accessToken, d.exchangeId, 'curto').expect(400);
      const waived = (await waive(ops.accessToken, d.exchangeId).expect(200)).body;
      expect(waived).toMatchObject({ status: 'approved', fee: { amount: 0 }, totalDue: { amount: 0 } });
      const [row] = await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, d.exchangeId));
      expect(row).toMatchObject({ status: 'approved', feeCents: 0, feeDueAt: null });
      expect(row!.itemDueAt).not.toBeNull();
      expect((await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, d.exchangeId))).map((r) => r.kind)).toEqual(['exchange_pickup']); // a coleta entrou na fila
      const timeline = (await get(ops.accessToken, `/${d.exchangeId}`).expect(200)).body.timeline as { to: string; actor: string; reason: string }[];
      expect(timeline.at(-1)).toMatchObject({ to: 'approved', actor: 'admin' });
      expect(timeline.at(-1)!.reason).toContain('Taxa isentada pelo admin');
      const audit = (await ctx.http.get('/v1/admin/audit-log?action=exchange.fee_waived').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body.data as { targetId: string; reason: string }[];
      expect(audit.some((a) => a.targetId === d.exchangeId && a.reason === 'Cliente ligou: coleta falhou antes')).toBe(true);

      expect((await waive(ops.accessToken, d.exchangeId)).body.code).toBe('EXCHANGE_NOT_AWAITING_FEE');
      expect((await waive(ops.accessToken, randomUUID())).status).toBe(404);

      // Taxa já paga: 409 com a orientação (cancelar a troca e pedir de novo; DEC-062).
      const paid = await awaitingFee();
      await ctx.http.post(`/v1/exchanges/${paid.exchangeId}/payment`).set(bearer(paid.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
      expect((await waive(ops.accessToken, paid.exchangeId)).body.code).toBe('EXCHANGE_PAYMENT_IN_PROGRESS'); // PIX gerado e ainda não pago
      const [attempt] = await ctx.db.execute<{ id: string }>(`select id from payment_attempts where external_reference = 'exchange:${paid.exchangeId}' limit 1` as never).then((r) => r.rows);
      await approve(ctx, paid.buyer.user, attempt!.id);
      expect((await waive(ops.accessToken, paid.exchangeId)).body.code).toBe('EXCHANGE_FEE_ALREADY_PAID'); // DT-062/DEC-062: taxa paga não isenta (antes caía em NOT_AWAITING_FEE)
    });
  });
});
