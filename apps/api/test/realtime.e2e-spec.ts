import { io, type Socket } from 'socket.io-client';
import { eq } from 'drizzle-orm';
import { orders } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith, type Shop } from './helpers/orders.js';

type Evt = { event: string; payload: Record<string, unknown> };

/** Tempo real (ADR-004): handshake autenticado, salas decididas pelo servidor, eventos mínimos depois do commit. */
describe('Tempo real Socket.IO (DT-044, WB-192, WB-230 C4)', () => {
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

  /** Conecta e guarda tudo o que o servidor emite (menos eventos internos do cliente). */
  async function connect(token: string | undefined): Promise<{ socket: Socket; events: Evt[] }> {
    const socket = io(url, { auth: token === undefined ? {} : { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    const events: Evt[] = [];
    socket.onAny((event: string, payload: Record<string, unknown>) => void events.push({ event, payload }));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (e) => reject(e));
    });
    return { socket, events };
  }
  const rejected = (token: string | undefined) => connect(token).then(() => 'connected', (e: Error) => e.message);
  const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (events: Evt[], name: string, timeout = 3_000): Promise<Evt> => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = events.find((e) => e.event === name);
      if (found) return found;
      await settle(25);
    }
    throw new Error(`evento ${name} não chegou; recebidos: ${events.map((e) => e.event).join(',')}`);
  };

  async function paidOrder(shop: Shop) {
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    return { buyer, orderId: created.id, pay: async () => approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id) };
  }

  it('o handshake exige token válido de sessão ativa; sem token ou com token falso a conexão é recusada', async () => {
    expect(await rejected(undefined)).toBe('unauthenticated');
    expect(await rejected('x.y.z')).toBe('unauthenticated');
    const user = await createCustomer(ctx);
    expect(await rejected(user.accessToken)).toBe('connected');
    // sessão revogada (logout): o mesmo token deixa de valer
    await ctx.http.post('/v1/auth/logout').set(bearer(user.accessToken)).send({ refreshToken: user.refreshToken }).expect(204);
    expect(await rejected(user.accessToken)).toBe('unauthenticated');
  });

  it('cliente recebe só o estado do SEU pedido; a loja recebe pedido novo; a operação recebe delivery_ready; ninguém recebe o que não é seu', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item RT', priceCents: 5_000, stock: 20 }]);
    const otherShop = await shopWith(ctx, [{ name: 'Outro RT', priceCents: 5_000, stock: 20 }]);
    const o = await paidOrder(shop);
    const stranger = await createCustomer(ctx);
    const ops = await createAdmin(ctx, 'operations');
    const mine = await connect(o.buyer.user.accessToken);
    const other = await connect(stranger.accessToken);
    const owner = await connect(shop.store.owner.accessToken);
    const otherOwner = await connect(otherShop.store.owner.accessToken);
    const admin = await connect(ops.accessToken);

    await o.pay();
    const status = await waitFor(mine.events, 'order.status_changed');
    expect(status.payload).toMatchObject({ type: 'order.status_changed', v: 1, orderId: o.orderId, status: 'received' });
    expect(Object.keys(status.payload).sort()).toEqual(['number', 'occurredAt', 'orderId', 'status', 'type', 'v']); // mínimo: sem dado pessoal
    const created = await waitFor(owner.events, 'order.created');
    expect(created.payload).toMatchObject({ orderId: o.orderId, status: 'received' });

    const url = `/v1/stores/${shop.store.id}/orders/${o.orderId}`;
    await ctx.http.post(`${url}/accept`).set(bearer(shop.store.owner.accessToken)).expect(200);
    await ctx.http.post(`${url}/status`).set(bearer(shop.store.owner.accessToken)).send({ status: 'ready_for_collection', volumes: 1 }).expect(200);
    const ready = await waitFor(admin.events, 'delivery_ready');
    expect(ready.payload).toMatchObject({ type: 'delivery_ready', orderId: o.orderId, storeId: shop.store.id });
    await waitFor(mine.events, 'order.status_changed');

    await settle();
    expect(other.events).toEqual([]); // outro cliente: nada
    expect(otherOwner.events).toEqual([]); // outra loja: nada
    expect(mine.events.some((e) => e.event === 'delivery_ready' || e.event === 'order.created')).toBe(false); // cliente não vê alerta da operação nem da loja
    expect(owner.events.some((e) => e.event === 'delivery_ready')).toBe(false);
    expect(admin.events.some((e) => e.event === 'order.created')).toBe(false);
  });

  it('subscribe só aceita pedido do usuário ou da loja dele; pedido alheio e id inválido recebem ok=false', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item RT2', priceCents: 5_000, stock: 20 }]);
    const o = await paidOrder(shop);
    const stranger = await createCustomer(ctx);
    const mine = await connect(o.buyer.user.accessToken);
    const other = await connect(stranger.accessToken);
    const owner = await connect(shop.store.owner.accessToken);
    const ask = (s: Socket, orderId: unknown) => s.timeout(2_000).emitWithAck('subscribe', { orderId }) as Promise<{ ok: boolean }>;
    expect(await ask(mine.socket, o.orderId)).toEqual({ ok: true });
    expect(await ask(owner.socket, o.orderId)).toEqual({ ok: true });
    expect(await ask(other.socket, o.orderId)).toEqual({ ok: false });
    expect(await ask(mine.socket, 'não-é-uuid')).toEqual({ ok: false });
    expect(await ask(mine.socket, '00000000-0000-4000-8000-000000000000')).toEqual({ ok: false });
    // quem assinou o pedido sem estar na sala do usuário também o recebe (sala order:{id})
    await o.pay();
    await waitFor(owner.events, 'order.status_changed');
    await settle();
    expect(other.events).toEqual([]);
    await ctx.db.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, o.orderId));
  });

  it('trocas: cliente e loja recebem exchange.status_changed; a loja recebe exchange.requested; outra loja não', async () => {
    const shop = await shopWith(ctx, [{ name: 'Camisa RT', priceCents: 8_000, stock: 20 }]);
    const otherShop = await shopWith(ctx, [{ name: 'Outra RT', priceCents: 8_000, stock: 20 }]);
    const o = await paidOrder(shop);
    await o.pay();
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(), exchangeVoluntaryDays: 7 }).where(eq(orders.id, o.orderId));
    const items = (await ctx.http.get(`/v1/orders/${o.orderId}/exchange-options`).set(bearer(o.buyer.user.accessToken)).expect(200)).body.items as { orderItemId: string }[];
    const mine = await connect(o.buyer.user.accessToken);
    const owner = await connect(shop.store.owner.accessToken);
    const otherOwner = await connect(otherShop.store.owner.accessToken);
    await ctx.http
      .post(`/v1/orders/${o.orderId}/exchanges`)
      .set(bearer(o.buyer.user.accessToken))
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ orderItemId: items[0]!.orderItemId, type: 'withdrawal', method: 'drop_at_store' })
      .expect(201);
    expect((await waitFor(mine.events, 'exchange.status_changed')).payload).toMatchObject({ type: 'exchange.status_changed', v: 1, orderId: o.orderId });
    expect((await waitFor(owner.events, 'exchange.requested')).payload).toMatchObject({ type: 'exchange.requested', orderId: o.orderId });
    await settle();
    expect(otherOwner.events).toEqual([]);
  });
});
