import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { LedgerService } from '../src/modules/finance/ledger.service.js';
import { orders, paymentAlerts, paymentRefunds, productVariants, storeMembers } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';

describe('Painel de pedidos da loja: lista, detalhe, comanda e transições (WB-067 a WB-072, RN-07, RN-08)', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  let ordersService: OrdersService;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ledger = ctx.app.get(LedgerService);
    ordersService = ctx.app.get(OrdersService);
  });
  afterAll(() => ctx.close());

  const owner = (shop: Shop) => bearer(shop.store.owner.accessToken);
  const base = (shop: Shop) => `/v1/stores/${shop.store.id}/orders`;
  const variantRow = async (id: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, id)))[0]!;

  /** Pedido PAGO (recebido) de um cliente novo na loja. */
  const paidOrder = async (shop: Shop, quantity = 1, over: Record<string, unknown> = {}) => {
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, quantity).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId, over)).body;
    expect(created.id, JSON.stringify(created)).toBeDefined();
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    return { buyer, id: created.id as string };
  };

  it('lista só pedidos PAGOS da loja, com os novos primeiro por data, grupos e contagem; cliente só com o primeiro nome', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }]);
    const unpaidBuyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, unpaidBuyer.user, shop.variants[0]!, 1).expect(200);
    await placeOrder(ctx, unpaidBuyer.user, unpaidBuyer.addressId); // aguardando pagamento: a loja não vê
    const a = await paidOrder(shop);
    const b = await paidOrder(shop);
    const list = (await ctx.http.get(base(shop)).set(owner(shop)).expect(200)).body;
    expect(list.data.map((o: { id: string }) => o.id)).toEqual([b.id, a.id]);
    expect(list.data[0]).toMatchObject({ status: 'received', mode: 'delivery', customerFirstName: 'Maria', itemCount: 1, firstItemName: 'Item', total: { amount: 3_500 }, allowedActions: ['accept', 'refuse'] });
    expect(list.data[0].acceptDeadlineAt).toEqual(expect.any(String));
    expect(JSON.stringify(list)).not.toMatch(/teste\.webag\.local|98888/); // sem e-mail nem telefone na lista
    expect((await ctx.http.get(`${base(shop)}/counts`).set(owner(shop)).expect(200)).body).toEqual({ new: 2, in_progress: 0, history: 0 });
    const page1 = (await ctx.http.get(`${base(shop)}?limit=1`).set(owner(shop)).expect(200)).body;
    expect(page1.data).toHaveLength(1);
    const page2 = (await ctx.http.get(`${base(shop)}?limit=1&cursor=${page1.nextCursor}`).set(owner(shop)).expect(200)).body;
    expect(page2.data[0].id).toBe(a.id);
    expect(page2.nextCursor).toBeNull();
    const num = list.data[1].number as string;
    expect((await ctx.http.get(`${base(shop)}?number=${num.toLowerCase()}`).set(owner(shop)).expect(400)).body.code).toBeDefined();
    expect((await ctx.http.get(`${base(shop)}?number=${num}`).set(owner(shop)).expect(200)).body.data.map((o: { id: string }) => o.id)).toEqual([a.id]);
  });

  it('aceitar: vai a "aceito", cancela o prazo de 10 min, é idempotente (toque duplo) e notifica o histórico', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }]);
    const { id } = await paidOrder(shop);
    const first = await ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)).expect(200);
    expect(first.body).toMatchObject({ status: 'accepted', allowedActions: ['prepare', 'ready', 'cancel'] });
    expect(first.body.timeline.map((t: { status: string; actor: string }) => `${t.status}:${t.actor}`)).toEqual(['awaiting_payment:customer', 'received:system', 'accepted:store']);
    await ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)).expect(200); // repetir não erra nem duplica
    expect((await orderRow(ctx, id)).acceptDeadlineAt).toBeNull();
    // o sweep do timeout NÃO cancela um pedido aceito
    await ordersService.sweep(new Date(Date.now() + 30 * 60_000));
    expect((await orderRow(ctx, id)).status).toBe('accepted');
    const timeline = (await ctx.http.get(`${base(shop)}/${id}`).set(owner(shop)).expect(200)).body.timeline;
    expect(timeline.filter((t: { status: string }) => t.status === 'accepted')).toHaveLength(1);
  });

  it('entrega Webag (DEC-036): a loja vai até "pronto para coleta"; "saiu" e "entregue" não são dela; sem retrocesso', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }]);
    const { id } = await paidOrder(shop);
    const status = (to: string, body: Record<string, unknown> = {}) => ctx.http.post(`${base(shop)}/${id}/status`).set(owner(shop)).send({ status: to, ...body });
    expect((await status('in_preparation')).body.code).toBe('INVALID_TRANSITION'); // ainda "recebido"
    await ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)).expect(200);
    expect((await status('delivered')).status).toBe(409); // pulou etapas
    expect((await status('ready_for_pickup')).status).toBe(409); // pedido é de entrega
    expect((await status('out_for_delivery')).status).toBe(400); // a loja não marca "saiu para entrega": é da logística
    expect((await status('in_preparation')).body).toMatchObject({ status: 'in_preparation' });
    const ready = (await status('ready_for_collection', { volumes: 2, note: 'tocar a campainha' })).body;
    expect(ready).toMatchObject({ status: 'ready_for_collection', allowedActions: ['prepare'], logistics: { status: 'ready_for_collection', courierFirstName: null, volumes: 2 } });
    expect((await status('delivered')).status).toBe(409); // a loja não marca "entregue" na entrega Webag
    expect((await ctx.http.post(`${base(shop)}/${id}/cancel`).set(owner(shop)).send({ reason: 'desisti da venda' })).status).toBe(409); // depois do pronto, só o admin cancela
    expect((await status('ready_for_collection')).body.status).toBe('ready_for_collection'); // toque duplo: idempotente
    expect((await ctx.http.get(`${base(shop)}?scope=in_progress`).set(owner(shop)).expect(200)).body.data.map((o: { id: string }) => o.id)).toContain(id);
  });

  it('retirada: só conclui com o código de 4 dígitos que o CLIENTE informa; a loja nunca vê o código', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }], { pickupEnabled: true });
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const revision = (await ctx.http.get('/v1/cart?mode=pickup').set(bearer(buyer.user.accessToken)).expect(200)).body.revision;
    const created = (await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'pickup', cartRevision: revision, paymentMethod: 'pix' }).expect(201)).body;
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const id = created.id as string;
    const status = (to: string, body: Record<string, unknown> = {}) => ctx.http.post(`${base(shop)}/${id}/status`).set(owner(shop)).send({ status: to, ...body });
    await ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)).expect(200);
    expect((await status('ready_for_pickup')).body).toMatchObject({ status: 'ready_for_pickup', allowedActions: ['complete', 'cancel'] });
    const detail = (await ctx.http.get(`${base(shop)}/${id}`).set(owner(shop)).expect(200)).body;
    expect(JSON.stringify(detail)).not.toContain((await orderRow(ctx, id)).pickupCode!);
    expect((await status('delivered')).body.code).toBe('PICKUP_CODE_INVALID');
    expect((await status('delivered', { pickupCode: '0000' === (await orderRow(ctx, id)).pickupCode ? '1111' : '0000' })).body.code).toBe('PICKUP_CODE_INVALID');
    const customerView = (await ctx.http.get(`/v1/orders/${id}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    expect(customerView.pickup.code).toMatch(/^\d{4}$/);
    expect((await status('delivered', { pickupCode: customerView.pickup.code })).body.status).toBe('delivered');
  });

  it('SEC-138: 5 códigos de retirada errados bloqueiam a conferência por 30 min, avisam o admin, e nem o código certo passa enquanto bloqueado', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }], { pickupEnabled: true });
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const revision = (await ctx.http.get('/v1/cart?mode=pickup').set(bearer(buyer.user.accessToken)).expect(200)).body.revision;
    const created = (await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'pickup', cartRevision: revision, paymentMethod: 'pix' }).expect(201)).body;
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const id = created.id as string;
    const status = (to: string, body: Record<string, unknown> = {}) => ctx.http.post(`${base(shop)}/${id}/status`).set(owner(shop)).send({ status: to, ...body });
    await ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)).expect(200);
    await status('ready_for_pickup');
    const real = (await orderRow(ctx, id)).pickupCode!;
    const wrong = real === '0000' ? '1111' : '0000';
    for (let n = 1; n <= 5; n++) expect((await status('delivered', { pickupCode: wrong })).body.code).toBe('PICKUP_CODE_INVALID');
    const locked = await status('delivered', { pickupCode: real });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('PICKUP_CODE_LOCKED');
    expect((await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'pickup_code_locked'))).some((a) => (a.details as { orderId?: string }).orderId === id)).toBe(true);
    await ctx.redis.del(`pickup-code-fails:${id}`); // passa o tempo do bloqueio
    expect((await status('delivered', { pickupCode: real })).body.status).toBe('delivered');
  });

  it('recusar: motivo obrigatório, estorno total automático, estoque devolvido, ledger zerado e o cliente vê o motivo', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }]);
    const { buyer, id } = await paidOrder(shop, 2);
    expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 28 });
    await ctx.http.post(`${base(shop)}/${id}/refuse`).set(owner(shop)).send({}).expect(400);
    await ctx.http.post(`${base(shop)}/${id}/refuse`).set(owner(shop)).send({ reason: 'ab' }).expect(400);
    const res = await ctx.http.post(`${base(shop)}/${id}/refuse`).set(owner(shop)).send({ reason: 'Produto acabou na loja' }).expect(200);
    expect(res.body).toMatchObject({ status: 'refused', cancellation: { by: 'store', reason: 'Produto acabou na loja' }, allowedActions: [] });
    expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 30, reserved: 0 });
    const attempt = await attemptOf(ctx, id);
    expect((await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).map((r) => r.amountCents)).toEqual([6_500]);
    expect(await ledger.balances(id)).toMatchObject({ refundedCents: 6_500, commissionRevenue: 0 });
    const customerView = (await ctx.http.get(`/v1/orders/${id}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    expect(customerView).toMatchObject({ status: 'refused', cancellation: { by: 'store', reason: 'Produto acabou na loja' } });
    await ctx.http.post(`${base(shop)}/${id}/refuse`).set(owner(shop)).send({ reason: 'Produto acabou na loja' }).expect(200); // idempotente
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(1);
    await ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)).expect(409);
  });

  it('loja cancela depois do aceite com motivo: estorno total, estoque devolvido; aceito não pode ser "recusado"', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }]);
    const { id } = await paidOrder(shop);
    await ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)).expect(200);
    await ctx.http.post(`${base(shop)}/${id}/refuse`).set(owner(shop)).send({ reason: 'tarde demais' }).expect(409);
    await ctx.http.post(`${base(shop)}/${id}/cancel`).set(owner(shop)).send({}).expect(400);
    const res = await ctx.http.post(`${base(shop)}/${id}/cancel`).set(owner(shop)).send({ reason: 'Entregador indisponível' }).expect(200);
    expect(res.body).toMatchObject({ status: 'cancelled', cancellation: { by: 'store' } });
    expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 30, reserved: 0 });
    expect((await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, (await attemptOf(ctx, id)).id)))[0]!.amountCents).toBe(3_500);
  });

  it('detalhe: endereço, telefone só enquanto em andamento, valores com comissão, comanda sem preços', async () => {
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 10_000, stock: 30 }]);
    const { id } = await paidOrder(shop);
    const detail = (await ctx.http.get(`${base(shop)}/${id}`).set(owner(shop)).expect(200)).body;
    expect(detail.customer).toMatchObject({ firstName: 'Maria', phone: expect.any(String) });
    expect(detail.delivery.address).toMatchObject({ street: 'Rua Teste', number: '10' });
    expect(detail.values).toMatchObject({ subtotal: { amount: 10_000 }, delivery: { amount: 500 }, total: { amount: 10_500 }, commission: { amount: 1_000 }, netBeforeProviderFee: { amount: 9_000 } });
    expect(detail.items[0]).toMatchObject({ name: 'Camiseta', quantity: 1, unitPrice: { amount: 10_000 } });
    const ticket = (await ctx.http.get(`${base(shop)}/${id}/ticket`).set(owner(shop)).expect(200)).body;
    expect(ticket).toMatchObject({ mode: 'delivery', customerFirstName: 'Maria', destination: expect.stringContaining('Rua Teste'), items: [{ quantity: 1, name: 'Camiseta' }] });
    expect(JSON.stringify(ticket)).not.toMatch(/amount|Cents|phone/);
    await ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)).expect(200);
    await ctx.http.post(`${base(shop)}/${id}/cancel`).set(owner(shop)).send({ reason: 'Teste de privacidade' }).expect(200);
    expect((await ctx.http.get(`${base(shop)}/${id}`).set(owner(shop)).expect(200)).body.customer.phone).toBeNull();
  });

  describe('acesso (IDOR e permissões)', () => {
    it('lojista de OUTRA loja: 404 em tudo, e nada muda no pedido; sem login 401; id inválido 404', async () => {
      const shopA = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }]);
      const shopB = await shopWith(ctx, [{ name: 'Item B', priceCents: 3_000, stock: 30 }]);
      const { id } = await paidOrder(shopA);
      // dono da loja B tentando operar a loja A pela URL de A: 404 do guard
      for (const path of ['', '/ticket', '/accept', '/refuse', '/cancel', '/status']) {
        const method = path === '' || path === '/ticket' ? 'get' : 'post';
        const res = await ctx.http[method](`${base(shopA)}/${id}${path}`).set(owner(shopB)).send({ reason: 'invasão', status: 'in_preparation' });
        expect(res.status, `${method} ${path}`).toBe(404);
      }
      // dono da loja B com o pedido da loja A pela URL de B: também 404 (a consulta é escopada pela loja da rota)
      for (const path of ['', '/ticket']) expect((await ctx.http.get(`${base(shopB)}/${id}${path}`).set(owner(shopB))).status).toBe(404);
      await ctx.http.post(`${base(shopB)}/${id}/accept`).set(owner(shopB)).expect(404);
      await ctx.http.post(`${base(shopB)}/${id}/refuse`).set(owner(shopB)).send({ reason: 'invasão' }).expect(404);
      expect((await orderRow(ctx, id)).status).toBe('received');
      await ctx.http.get(base(shopA)).expect(401);
      await ctx.http.get(`${base(shopA)}/nao-uuid`).set(owner(shopA)).expect(404);
      await ctx.http.get(`${base(shopA)}/${randomUUID()}`).set(owner(shopA)).expect(404);
      // cliente comum (nem membro) também não
      const stranger = await registerUser(ctx);
      await ctx.http.get(base(shopA)).set(bearer(stranger.accessToken)).expect(404);
    });

    it('funcionário precisa da permissão `orders`; sem `sales_values` não vê preços nem comissão', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }]);
      const { id } = await paidOrder(shop);
      const withOrders = await registerUser(ctx);
      const withValues = await registerUser(ctx);
      const without = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values([
        { storeId: shop.store.id, userId: withOrders.userId, role: 'staff', permissions: ['orders'] },
        { storeId: shop.store.id, userId: withValues.userId, role: 'staff', permissions: ['orders', 'sales_values'] },
        { storeId: shop.store.id, userId: without.userId, role: 'staff', permissions: ['catalog'] },
      ]);
      await ctx.http.get(base(shop)).set(bearer(without.accessToken)).expect(403);
      await ctx.http.post(`${base(shop)}/${id}/accept`).set(bearer(without.accessToken)).expect(403);
      const hidden = (await ctx.http.get(`${base(shop)}/${id}`).set(bearer(withOrders.accessToken)).expect(200)).body;
      expect(hidden.values).toBeNull();
      expect(hidden.items[0].unitPrice).toBeNull();
      expect((await ctx.http.get(base(shop)).set(bearer(withOrders.accessToken)).expect(200)).body.data[0].total).toBeNull();
      const shown = (await ctx.http.get(`${base(shop)}/${id}`).set(bearer(withValues.accessToken)).expect(200)).body;
      expect(shown.values.commission.amount).toBe(300);
      // funcionário com `orders` aceita o pedido; o ator fica no histórico
      expect((await ctx.http.post(`${base(shop)}/${id}/accept`).set(bearer(withOrders.accessToken)).expect(200)).body.status).toBe('accepted');
      expect((await ctx.db.select().from(orders).where(eq(orders.id, id)))[0]!.status).toBe('accepted');
    });
  });

  it('aceite e recusa simultâneos: só uma ação vence e o dinheiro nunca é estornado se o pedido foi aceito', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 30 }]);
    const { id } = await paidOrder(shop);
    const [a, b] = await Promise.all([ctx.http.post(`${base(shop)}/${id}/accept`).set(owner(shop)), ctx.http.post(`${base(shop)}/${id}/refuse`).set(owner(shop)).send({ reason: 'Sem estoque agora' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const final = (await orderRow(ctx, id)).status;
    expect(['accepted', 'refused']).toContain(final);
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, (await attemptOf(ctx, id)).id));
    expect(refunds).toHaveLength(final === 'refused' ? 1 : 0);
  });
});
