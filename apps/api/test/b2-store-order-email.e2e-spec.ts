import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { OrderEventBus, OrdersService, type OrderEvent } from '../src/modules/orders/index.js';
import { orders, storeActivity, storeMembers, storeSettings, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, cartView, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** B2 / WB-192 C2 e C3 (DEC-073): aviso de pedido novo e lembrete de aceite por e-mail ao lojista, com o painel fechado. */
describe('B2: e-mail de pedido novo e de lembrete de aceite à loja', () => {
  let ctx: TestContext;
  let bus: OrderEventBus;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    bus = ctx.app.get(OrderEventBus);
  });
  afterAll(() => ctx.close());

  /** Loja com o dono e 2 funcionários (um com a permissão `orders`, outro sem) e 1 pedido PAGO de 7 itens distintos. */
  async function paidOrder(items = 1, over: { mode?: 'delivery' | 'pickup' } = {}) {
    const shop = await shopWith(ctx, Array.from({ length: items }, (_, i) => ({ name: `Produto ${i + 1}`, priceCents: 3_000 + i * 100, stock: 20 })), { pickupEnabled: true });
    const staffOrders = await registerUser(ctx);
    const staffCatalog = await registerUser(ctx);
    await ctx.db.insert(storeMembers).values([
      { storeId: shop.store.id, userId: staffOrders.userId, role: 'staff', permissions: ['orders'] },
      { storeId: shop.store.id, userId: staffCatalog.userId, role: 'staff', permissions: ['catalog'] },
    ]);
    const buyer = await customerAt(ctx, shop.origin);
    for (const variant of shop.variants) await addToCart(ctx, buyer.user, variant, 2).expect(200);
    let created;
    if (over.mode === 'pickup') {
      const { revision, totalCents } = await cartView(ctx, buyer.user, undefined);
      created = await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'pickup', cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix' });
    } else {
      created = await placeOrder(ctx, buyer.user, buyer.addressId);
    }
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    const number = created.body.number as string;
    await approve(ctx, buyer.user, (await attemptOf(ctx, id)).id);
    return { shop, buyer, id, number, staffOrders, staffCatalog };
  }
  const mailsOf = (email: string, number: string) => ctx.mail.to(email).filter((m) => m.subject.includes(number));
  const customerData = (r: Awaited<ReturnType<typeof paidOrder>>) => [r.buyer.user.email, 'Rua Teste', '07900', 'Maria'];

  it('pedido pago: dono e funcionário com `orders` recebem 1 e-mail com número, itens, prazo e link; o funcionário sem a permissão, não', async () => {
    const r = await paidOrder(2);
    const owner = mailsOf(r.shop.store.owner.email, r.number);
    expect(owner).toHaveLength(1);
    expect(mailsOf(r.staffOrders.email, r.number)).toHaveLength(1);
    expect(mailsOf(r.staffCatalog.email, r.number)).toHaveLength(0);

    const mail = owner[0]!;
    expect(mail.subject).toMatch(/^Novo pedido .+ em .+: aceite em até \d+ min$/);
    expect(mail.text).toContain(`Pedido ${r.number} (Entrega pela Webag)`);
    expect(mail.text).toContain('- 2x Produto 1');
    expect(mail.text).toContain('- 2x Produto 2');
    expect(mail.text).toMatch(/Aceite até \d{2}:\d{2} \(horário de Brasília\), em \d+ min/);
    expect(mail.text).toContain(`/lojista/pedidos/${r.id}`);
    expect(mail.text).toMatch(/cancelado e o cliente é estornado/);
  });

  it('o e-mail não leva dado do cliente nem valor em R$ (o funcionário sem `sales_values` não vê preço no painel)', async () => {
    const r = await paidOrder(2);
    const text = JSON.stringify(mailsOf(r.shop.store.owner.email, r.number));
    for (const forbidden of customerData(r)) expect(text, forbidden).not.toContain(forbidden);
    expect(text).not.toMatch(/R\$|\d+,\d{2}/);
    const [buyer] = await ctx.db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, r.buyer.user.userId));
    expect(text).not.toContain(buyer!.name); // nem o nome do cliente
    if (buyer!.phone) expect(text).not.toContain(buyer!.phone);
  });

  it('o resumo mostra até 5 itens e "e mais N"; retirada diz "Retirada na loja"', async () => {
    const r = await paidOrder(7);
    const text = mailsOf(r.shop.store.owner.email, r.number)[0]!.text;
    expect(text.match(/^- \d+x /gm)).toHaveLength(5);
    expect(text).toContain('- e mais 2 itens');
    const pickup = await paidOrder(1, { mode: 'pickup' });
    expect(mailsOf(pickup.shop.store.owner.email, pickup.number)[0]!.text).toContain('(Retirada na loja)');
  });

  it('deduplicação: o mesmo evento de pedido pago publicado de novo não gera segundo e-mail', async () => {
    const r = await paidOrder();
    expect(mailsOf(r.shop.store.owner.email, r.number)).toHaveLength(1);
    const row = await orderRow(ctx, r.id);
    expect(row.storeNotifiedAt).not.toBeNull();
    const again: OrderEvent = { orderId: r.id, number: r.number, userId: row.userId, storeId: row.storeId, from: 'awaiting_payment', to: 'received', actor: 'system', reason: 'Pagamento aprovado', at: new Date() };
    await bus.emit(again);
    await bus.emit(again);
    expect(mailsOf(r.shop.store.owner.email, r.number)).toHaveLength(1);
  });

  it('lembrete: um só "Aceite agora" antes do timeout, com o tempo que resta; depois de aceito, nenhum', async () => {
    const r = await paidOrder();
    const svc = ctx.app.get(OrdersService);
    await svc.sweep(new Date());
    expect(mailsOf(r.shop.store.owner.email, r.number)).toHaveLength(1); // pago agora: só o aviso de pedido novo
    // 6 min sem aceite (lembrete aos 5, timeout aos 10)
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 6 * 60_000), acceptDeadlineAt: new Date(Date.now() + 4 * 60_000) }).where(eq(orders.id, r.id));
    await svc.sweep(new Date());
    await svc.sweep(new Date());
    const mails = mailsOf(r.shop.store.owner.email, r.number);
    expect(mails).toHaveLength(2);
    const reminder = mails.find((m) => m.subject.startsWith('Aceite agora'))!;
    expect(reminder.subject).toMatch(/^Aceite agora: o pedido .+ vence em [34] min$/);
    expect(reminder.text).toContain(`/lojista/pedidos/${r.id}`);
    expect(mailsOf(r.staffOrders.email, r.number)).toHaveLength(2);
    expect(mailsOf(r.staffCatalog.email, r.number)).toHaveLength(0);

    // pedido que foi aceito antes do lembrete não recebe "Aceite agora"
    const other = await paidOrder();
    await ctx.http.post(`/v1/stores/${other.shop.store.id}/orders/${other.id}/accept`).set(bearer(other.shop.store.owner.accessToken)).expect(200);
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 6 * 60_000) }).where(eq(orders.id, other.id));
    await svc.sweep(new Date());
    expect(mailsOf(other.shop.store.owner.email, other.number)).toHaveLength(1);
  });

  it('preferência por loja: o dono desliga e liga; funcionário não mexe; desligada, nem o pedido novo nem o lembrete mandam e-mail (o push segue)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Produto Pref', priceCents: 3_000, stock: 50 }]);
    const staff = await registerUser(ctx);
    await ctx.db.insert(storeMembers).values({ storeId: shop.store.id, userId: staff.userId, role: 'staff', permissions: ['orders'] });
    const url = `/v1/stores/${shop.store.id}/notifications`;
    const owner = bearer(shop.store.owner.accessToken);
    const settings = async () => (await ctx.http.get(`/v1/stores/${shop.store.id}/settings`).set(owner).expect(200)).body.notifications;

    expect(await settings()).toEqual({ newOrderEmail: true });
    await ctx.http.put(url).set(bearer(staff.accessToken)).send({ newOrderEmail: false }).expect(403); // só o dono
    await ctx.http.put(url).send({ newOrderEmail: false }).expect(401);
    await ctx.http.put(url).set(owner).send({ newOrderEmail: 'não' }).expect(400);
    await ctx.http.put(url).set(owner).send({ newOrderEmail: false, extra: 1 }).expect(400);
    await ctx.http.put(url).set(owner).send({ newOrderEmail: false }).expect(204);
    expect(await settings()).toEqual({ newOrderEmail: false });
    expect((await ctx.db.select().from(storeSettings).where(eq(storeSettings.storeId, shop.store.id)))[0]!.notifyNewOrderEmail).toBe(false);

    const order = async () => {
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId, {}, randomUUID())).body as { id: string; number: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      return created;
    };
    const off = await order();
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 6 * 60_000) }).where(eq(orders.id, off.id));
    await ctx.app.get(OrdersService).sweep(new Date());
    expect(mailsOf(shop.store.owner.email, off.number)).toHaveLength(0);
    expect(mailsOf(staff.email, off.number)).toHaveLength(0);

    await ctx.http.put(url).set(owner).send({ newOrderEmail: true }).expect(204);
    const on = await order();
    expect(mailsOf(shop.store.owner.email, on.number)).toHaveLength(1);

    // trilha: quem, antes e depois
    const log = await ctx.db.select().from(storeActivity).where(eq(storeActivity.storeId, shop.store.id));
    expect(log.filter((l) => l.action === 'store.notifications').map((l) => (l.details as { after: unknown }).after)).toEqual([{ newOrderEmail: false }, { newOrderEmail: true }]);
  });
});
