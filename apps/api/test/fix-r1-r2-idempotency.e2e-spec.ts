import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { exchangeRequests, orderItems, orders, paymentAttempts, productVariants, storeSettings } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, cartView, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** R.1 (I5/SEC-148, I8) e R.2 (I1): duas criações simultâneas, pagamento da troca com trava e `Idempotency-Key` sem repetir erro de estado. */
describe('Pedido e troca: concorrência e Idempotency-Key (R.1, R.2)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  it('I5/SEC-148: 3 criações simultâneas da mesma revisão (chaves diferentes) geram 1 pedido, 1 reserva e 1 cobrança', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 2).expect(200);
    const results = await Promise.all([1, 2, 3].map(() => placeOrder(ctx, buyer.user, buyer.addressId, { paymentMethod: 'card', card: { token: 'fake_tok_approved', installments: 1 } }, randomUUID())));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === 'CART_CHANGED')).toBe(true);
    const mine = await ctx.db.select().from(orders).where(eq(orders.userId, buyer.user.userId));
    expect(mine).toHaveLength(1);
    expect((await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, mine[0]!.id)))).toHaveLength(1);
    expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!)))[0]!.stock).toBe(8); // baixa uma vez só
  });

  it('I1: loja fechada não fica guardada por 24 h: abriu, a MESMA chave e o MESMO corpo criam o pedido', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }], { pausedIndefinitely: true });
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const { revision, totalCents } = await cartView(ctx, buyer.user, buyer.addressId);
    const key = randomUUID();
    const send = () => ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', key).send({ mode: 'delivery', addressId: buyer.addressId, cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix' });
    const closed = await send();
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe('STORE_CLOSED');
    await ctx.db.update(storeSettings).set({ pausedIndefinitely: false }).where(eq(storeSettings.storeId, shop.store.id));
    const open = await send();
    expect(open.status, JSON.stringify(open.body)).toBe(201);
    const replay = await send();
    expect(replay.status).toBe(200); // resultado com efeito continua idempotente
    expect(replay.body.id).toBe(open.body.id);
  });

  it('I1: 429 de pedidos pendentes não fica guardado: cancelou um pendente, a MESMA chave e o MESMO corpo passam', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 9 }]);
    const buyer = await customerAt(ctx, shop.origin);
    const pending: string[] = [];
    for (let i = 0; i < 2; i++) {
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const res = await placeOrder(ctx, buyer.user, buyer.addressId);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      pending.push(res.body.id as string);
    }
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const { revision, totalCents } = await cartView(ctx, buyer.user, buyer.addressId);
    const key = randomUUID();
    const send = () => ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', key).send({ mode: 'delivery', addressId: buyer.addressId, cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix' });
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_PENDING_ORDERS');
    await ctx.http.post(`/v1/orders/${pending[0]}/cancel`).set(bearer(buyer.user.accessToken)).send({}).expect(200);
    expect((await send()).status).toBe(201);
  });

  async function awaitingFeeExchange() {
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const order = await orderRow(ctx, created.id);
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7, deliverySnapshot: { ...(order.deliverySnapshot ?? {}), exchangeFeeCents: 900, expectedCostCents: 700 } }).where(eq(orders.id, created.id));
    const productId = (await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!)))[0]!.productId;
    const [sizeM] = await ctx.db.insert(productVariants).values({ productId, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
    const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, created.id));
    const res = await ctx.http.post(`/v1/orders/${created.id}/exchanges`).set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: item!.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: sizeM!.id }).expect(201);
    await ctx.http.post(`/v1/stores/${shop.store.id}/exchanges/${res.body.id}/accept`).set(bearer(shop.store.owner.accessToken)).send({}).expect(200);
    return { buyer, id: res.body.id as string };
  }
  const attemptsOf = (exchangeId: string) => ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${exchangeId}`));

  it('I8: 3 POST /payment simultâneos da troca com cartão geram UMA cobrança', async () => {
    const d = await awaitingFeeExchange();
    const pay = (key?: string) => {
      const req = ctx.http.post(`/v1/exchanges/${d.id}/payment`).set(bearer(d.buyer.user.accessToken));
      return (key ? req.set('Idempotency-Key', key) : req).send({ paymentMethod: 'card', card: { token: 'fake_tok_approved', installments: 1 } });
    };
    const results = await Promise.all([pay(), pay(randomUUID()), pay(randomUUID())]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 200).every((r) => r.status === 409)).toBe(true);
    expect(await attemptsOf(d.id)).toHaveLength(1);
    expect((await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, d.id)))[0]!.status).toBe('approved');
  });

  it('I8: PIX com a mesma Idempotency-Key devolve o mesmo pagamento; outro corpo com a mesma chave é 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const d = await awaitingFeeExchange();
    const key = randomUUID();
    const post = (body: Record<string, unknown>) => ctx.http.post(`/v1/exchanges/${d.id}/payment`).set(bearer(d.buyer.user.accessToken)).set('Idempotency-Key', key).send(body);
    const a = await post({ paymentMethod: 'pix' });
    const b = await post({ paymentMethod: 'pix' });
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(await attemptsOf(d.id)).toHaveLength(1);
    const c = await post({ paymentMethod: 'card', card: { token: 'fake_tok_approved', installments: 1 } });
    expect(c.status).toBe(409);
    expect(c.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});
