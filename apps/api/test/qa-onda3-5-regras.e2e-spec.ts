import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { exchangeRequests, orderItems, orders, productVariants, deliveries } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { restoreFees, useFeeTable } from './helpers/fees.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/**
 * QA Onda 3 a 5: regras de valor e prazo que os testes existentes cobriam só em parte (limites exatos). Todos passam hoje; existem para
 * fixar o comportamento: teto do pedido, teto da taxa de troca, taxa de troca zerada pela região, prazos legais no limite (7, 30 e 90 dias)
 * e aprovação concorrente da mesma troca (a reserva do tamanho novo acontece uma vez).
 */
describe('Regras de valor e prazo nos limites (pedido máximo, taxa de troca, prazos legais)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });

  const hours = (h: number) => new Date(Date.now() - h * 3_600_000);

  async function delivered(opts: { qty?: number; deliveredAgoH?: number; quantityOfM?: number } = {}) {
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 6_000, stock: 20 }], { voluntaryExchangeDays: 30 });
    const productId = (await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!)))[0]!.productId;
    const [m] = await ctx.db.insert(productVariants).values({ productId, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: opts.quantityOfM ?? 5, reserved: 0 }).returning();
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, opts.qty ?? 1).expect(200);
    const order = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, order.id)).id);
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: hours(opts.deliveredAgoH ?? 24), exchangeVoluntaryDays: 30 }).where(eq(orders.id, order.id));
    const item = (await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)))[0]!;
    return { shop, buyer, orderId: order.id, item, m: m! };
  }
  type D = Awaited<ReturnType<typeof delivered>>;
  const ask = (d: D, body: Record<string, unknown>) => ctx.http.post(`/v1/orders/${d.orderId}/exchanges`).set(bearer(d.buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: d.item.id, ...body });
  const eligible = async (d: D) => {
    const opts = (await ctx.http.get(`/v1/orders/${d.orderId}/exchange-options`).set(bearer(d.buyer.user.accessToken)).expect(200)).body;
    return Object.fromEntries(opts.items[0].options.map((o: { type: string; eligible: boolean }) => [o.type, o.eligible])) as Record<string, boolean>;
  };

  it('pedido acima de pedido_max_cents (R$ 2.000,00) é recusado com 422 ABOVE_MAX_ORDER e a sacola é mantida (WB-023 C6)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Caro', priceCents: 250_000, stock: 3 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const res = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ABOVE_MAX_ORDER');
    expect((await ctx.http.get('/v1/cart').query({ addressId: buyer.addressId }).set(bearer(buyer.user.accessToken)).expect(200)).body.items).toHaveLength(1);
    expect((await ctx.db.select().from(orders).where(eq(orders.userId, buyer.user.userId)))).toHaveLength(0);
  });

  it('taxa de troca acima de R$ 30,00 (taxa_coleta_max_cents) é recusada na tabela do admin; R$ 30,00 exatos passa (WB-236 C8)', async () => {
    const finance = await createAdmin(ctx, 'finance');
    const version = async () => {
      const t = (await ctx.http.get('/v1/admin/delivery-fees').set(bearer(finance.accessToken)).expect(200)).body;
      return (t.version ?? t.data?.[0]?.version) as number;
    };
    const put = async (exchangeFeeCents: number) =>
      ctx.http.put('/v1/admin/delivery-fees').set(bearer(finance.accessToken)).send({ scopeType: 'default', tiers: [{ fromM: 0, toM: 15_000, feeCents: 5_000, exchangeFeeCents, expectedCostCents: 0, etaMinutes: 10 }], reason: 'teto da taxa de troca (QA)', expectedVersion: await version() });
    const over = await put(3_001);
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('FEE_TABLE_INVALID');
    expect((await put(3_000)).status).toBe(200);
    await restoreFees(ctx);
  });

  it('taxa de troca zerada pela região: coleta em casa aprovada vira corrida na hora, sem pagamento; levar à loja nunca tem corrida', async () => {
    await useFeeTable(ctx, [{ fromM: 0, toM: 15_000, feeCents: 500, exchangeFeeCents: 0 }]);
    const d = await delivered();
    const ex = await ask(d, { type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: d.m.id }).expect(201);
    expect(ex.body).toMatchObject({ status: 'requested', fee: { amount: 0 } });
    const accepted = await ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${ex.body.id}/accept`).set(bearer(d.shop.store.owner.accessToken)).send({}).expect(200);
    expect(accepted.body).toMatchObject({ status: 'approved', fee: { amount: 0 }, totalDue: { amount: 0 } });
    expect(await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, ex.body.id))).toMatchObject([{ kind: 'exchange_pickup', status: 'ready_for_collection' }]);
    await restoreFees(ctx);
  });

  it('prazos legais no limite, contados da ENTREGA: arrependimento 7 dias (6 d 23 h ok, 7 d 1 h vencido); defeito 90 dias em categoria durável (89 d ok, 91 d vencido)', async () => {
    const edge = async (hoursAgo: number) => eligible(await delivered({ deliveredAgoH: hoursAgo }));
    expect(await edge(6 * 24 + 23)).toMatchObject({ withdrawal: true, defect: true });
    expect(await edge(7 * 24 + 1)).toMatchObject({ withdrawal: false, defect: true });
    expect(await edge(89 * 24)).toMatchObject({ withdrawal: false, defect: true });
    expect(await edge(91 * 24)).toMatchObject({ withdrawal: false, defect: false });
    // o pedido feito há 20 dias mas entregue agora não perde prazo: conta da entrega, nunca do pedido
    const d = await delivered({ deliveredAgoH: 1 });
    await ctx.db.update(orders).set({ createdAt: hours(20 * 24) }).where(eq(orders.id, d.orderId));
    expect(await eligible(d)).toMatchObject({ withdrawal: true, size_color: true });
  });

  it('a loja aprova a mesma troca 4 vezes ao mesmo tempo: a reserva do tamanho novo acontece UMA vez (quantidade da linha) e recusar depois é 409', async () => {
    const d = await delivered({ qty: 2 });
    const ex = await ask(d, { type: 'size_color', reasonCode: 'size', method: 'drop_at_store', newVariantId: d.m.id }).expect(201);
    const own = bearer(d.shop.store.owner.accessToken);
    const out = await Promise.all([1, 2, 3, 4].map(() => ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${ex.body.id}/accept`).set(own).send({})));
    expect(out.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, d.m.id)))[0]!.reserved).toBe(2);
    expect((await ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${ex.body.id}/refuse`).set(own).send({ reason: 'tarde demais' })).status).toBe(409);
    expect((await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, ex.body.id)))[0]!.status).toBe('approved');
  });
});
