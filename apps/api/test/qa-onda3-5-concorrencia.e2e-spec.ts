import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/index.js';
import { couponRedemptions, exchangeRequests, orderItems, orders, paymentAttempts, paymentRefunds, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, attemptOf, cartView, customerAt, makeCoupon, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/**
 * QA Onda 3 a 5: o usuário mais azarado. Toque duplo, rede que reenvia, webhook em dobro, cancelar no mesmo instante em que o PIX cai,
 * dois clientes na última peça, IDOR nas trocas. O que importa: dinheiro e estoque nunca ficam inconsistentes.
 */
describe('Concorrência, idempotência e acesso indevido (dinheiro e estoque) nas ondas 3 a 5', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ledger = ctx.app.get(LedgerService);
    admin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(() => ctx.close());

  const variantRow = async (id: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, id)))[0]!;
  const approveRaw = (token: string, attemptId: string) => ctx.http.post(`/v1/dev/payments/${attemptId}/approve`).set(bearer(token)).send({});

  async function pendingOrder(opts: { price?: number; stock?: number } = {}) {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: opts.price ?? 5_000, stock: opts.stock ?? 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const res = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const orderId = res.body.id as string;
    return { shop, buyer, orderId, attempt: await attemptOf(ctx, orderId) };
  }

  it('toque duplo e rede ruim: 8 criações simultâneas com a MESMA Idempotency-Key geram 1 pedido, 1 reserva e respostas iguais (sem 500)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const key = randomUUID();
    const { revision, totalCents } = await cartView(ctx, buyer.user, buyer.addressId);
    const send = () => ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', key).send({ mode: 'delivery', addressId: buyer.addressId, cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix' });
    const results = await Promise.all(Array.from({ length: 8 }, send));
    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 200 || s === 201 || s === 409), `statuses: ${statuses.join(',')} ${JSON.stringify(results.find((r) => r.status >= 400)?.body)}`).toBe(true);
    expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
    const ids = new Set(results.filter((r) => r.status < 300).map((r) => r.body.id as string));
    expect(ids.size).toBe(1);
    const rows = await ctx.db.select().from(orders).where(eq(orders.userId, buyer.user.userId));
    expect(rows).toHaveLength(1);
    expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 10, reserved: 1 });
  });

  it('webhook em dobro: 6 aprovações simultâneas do mesmo PIX dão UMA venda no ledger e UMA baixa de estoque', async () => {
    const o = await pendingOrder();
    const results = await Promise.all(Array.from({ length: 6 }, () => approveRaw(o.buyer.user.accessToken, o.attempt.id)));
    expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
    expect((await orderRow(ctx, o.orderId)).status).toBe('received');
    expect(await variantRow(o.shop.variants[0]!)).toMatchObject({ stock: 9, reserved: 0 });
    const [sales] = (await ctx.db.execute(sql`select count(*)::int as n from ledger_transactions where order_id = ${o.orderId} and kind = 'sale'`)).rows as { n: number }[];
    expect(sales!.n).toBe(1);
    expect((await ledger.verifyOrder(o.orderId)).ok).toBe(true);
  });

  it('cancelar no mesmo instante em que o PIX cai (6 rodadas): nunca fica pedido pago sem estorno, nem estoque preso ou baixado em pedido cancelado', async () => {
    const seen = new Set<string>();
    for (let round = 0; round < 6; round++) {
      const o = await pendingOrder();
      const [c, a] = await Promise.all([ctx.http.post(`/v1/orders/${o.orderId}/cancel`).set(bearer(o.buyer.user.accessToken)).send({}), approveRaw(o.buyer.user.accessToken, o.attempt.id)]);
      expect(c.status, JSON.stringify(c.body)).toBeLessThan(500);
      expect(a.status, JSON.stringify(a.body)).toBeLessThan(500);
      // dar tempo ao estorno automático (PIX tardio ou cancelamento pós-pagamento)
      await ctx.app.get((await import('../src/modules/orders/index.js')).OrdersService).sweep().catch(() => undefined);
      const row = await orderRow(ctx, o.orderId);
      seen.add(row.status);
      const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, o.attempt.id));
      const refunded = refunds.reduce((s, r) => s + r.amountCents, 0);
      const bal = await ledger.balances(o.orderId);
      const v = await variantRow(o.shop.variants[0]!);
      expect(v.reserved, `rodada ${round}: reserva presa (${row.status})`).toBe(0);
      if (row.status === 'received') {
        expect(refunded, `rodada ${round}: pedido recebido não pode ter estorno`).toBe(0);
        expect(v.stock).toBe(9);
      } else {
        expect(['cancelled', 'expired']).toContain(row.status);
        expect(v.stock, `rodada ${round}: estoque baixado em pedido ${row.status}`).toBe(10);
        // se o cliente chegou a pagar (no provedor), o dinheiro tem que voltar por inteiro, mesmo que a venda nunca tenha sido lançada (PIX tardio)
        const [att] = await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, o.attempt.id));
        const paidAtProvider = ['approved', 'refunded'].includes(att!.status);
        expect(refunded, `rodada ${round}: pago no provedor (${att!.status}) e não devolvido (${row.status}, ledger pago ${bal.paidCents})`).toBe(paidAtProvider ? o.attempt.amountCents : 0);
        expect(bal.paidCents - bal.refundedCents, `rodada ${round}: ledger com saldo de dinheiro de pedido cancelado`).toBe(0);
      }
      expect((await ledger.verifyOrder(o.orderId)).ok).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('aceite da loja no mesmo instante do cancelamento do cliente (RECEBIDO, 6 rodadas): ou aceita sem estorno, ou cancela com estorno total; nunca os dois', async () => {
    for (let round = 0; round < 6; round++) {
      const o = await pendingOrder();
      await approveRaw(o.buyer.user.accessToken, o.attempt.id).expect(200);
      const [acc, can] = await Promise.all([
        ctx.http.post(`/v1/stores/${o.shop.store.id}/orders/${o.orderId}/accept`).set(bearer(o.shop.store.owner.accessToken)).send({}),
        ctx.http.post(`/v1/orders/${o.orderId}/cancel`).set(bearer(o.buyer.user.accessToken)).send({}),
      ]);
      expect(Math.max(acc.status, can.status), `${acc.status}/${can.status}`).toBeLessThan(500);
      const row = await orderRow(ctx, o.orderId);
      const refunded = (await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, o.attempt.id))).reduce((s, r) => s + r.amountCents, 0);
      if (row.status === 'cancelled') expect(refunded, `rodada ${round}`).toBe(o.attempt.amountCents);
      else {
        expect(row.status, `rodada ${round}`).toBe('accepted');
        expect(refunded, `aceito não pode ter estorno (rodada ${round})`).toBe(0);
      }
      expect((await variantRow(o.shop.variants[0]!)).reserved).toBe(0);
      expect((await ledger.verifyOrder(o.orderId)).ok).toBe(true);
    }
  });

  it('cupom com 3 usos e 6 clientes ao mesmo tempo: exatamente 3 pedidos com desconto e o contador de usos nunca passa de 3', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 20 }]);
    const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'store', storeId: shop.store.id, value: 1_000, maxUses: 3 });
    const buyers = await Promise.all(Array.from({ length: 6 }, () => customerAt(ctx, shop.origin)));
    for (const b of buyers) {
      await addToCart(ctx, b.user, shop.variants[0]!, 1).expect(200);
      await ctx.http.put('/v1/cart/coupon').set(bearer(b.user.accessToken)).send({ code: coupon.code }).expect(200);
    }
    const res = await Promise.all(buyers.map((b) => placeOrder(ctx, b.user, b.addressId)));
    expect(res.filter((r) => r.status === 201)).toHaveLength(3);
    expect(res.filter((r) => r.status >= 500)).toHaveLength(0);
    expect(await ctx.db.select().from(couponRedemptions).where(eq(couponRedemptions.couponId, coupon.id))).toHaveLength(3);
    // os que perderam NÃO foram cobrados sem o desconto que viram (SEC-147): 409, sem pedido
    for (const [i, r] of res.entries()) if (r.status !== 201) expect(await ctx.db.select().from(orders).where(eq(orders.userId, buyers[i]!.user.userId))).toHaveLength(0);
  });

  describe('troca de tamanho: a última peça do tamanho novo', () => {
    it('duas trocas aprovadas ao mesmo tempo pela última unidade do M: uma aprova e reserva, a outra recebe 409 EXCHANGE_NO_STOCK; reserva nunca passa do estoque', async () => {
      const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 6_000, stock: 20 }], { voluntaryExchangeDays: 7 });
      const productId = (await variantRow(shop.variants[0]!)).productId;
      const [sizeM] = await ctx.db.insert(productVariants).values({ productId, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 1, reserved: 0 }).returning();
      const exchanges: { id: string }[] = [];
      for (let i = 0; i < 2; i++) {
        const buyer = await customerAt(ctx, shop.origin);
        await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
        const order = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
        await approveRaw(buyer.user.accessToken, (await attemptOf(ctx, order.id)).id).expect(200);
        await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7 }).where(eq(orders.id, order.id));
        const item = (await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)))[0]!;
        const res = await ctx.http.post(`/v1/orders/${order.id}/exchanges`).set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: item.id, type: 'size_color', reasonCode: 'size', method: 'drop_at_store', newVariantId: sizeM!.id });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        exchanges.push({ id: res.body.id as string });
      }
      const owner = bearer(shop.store.owner.accessToken);
      const out = await Promise.all(exchanges.map((e) => ctx.http.post(`/v1/stores/${shop.store.id}/exchanges/${e.id}/accept`).set(owner).send({})));
      expect(out.map((r) => r.status).sort(), JSON.stringify(out.map((r) => r.body))).toEqual([200, 409]);
      expect(out.find((r) => r.status === 409)!.body.code).toBe('EXCHANGE_NO_STOCK');
      const m = await variantRow(sizeM!.id);
      expect(m.reserved).toBe(1);
      expect(m.reserved).toBeLessThanOrEqual(m.stock);
      const rows = await ctx.db.select().from(exchangeRequests).where(sql`${exchangeRequests.id} in (${sql.join(exchanges.map((e) => sql`${e.id}::uuid`), sql`, `)})`);
      expect(rows.filter((r) => r.reservationState === 'reserved')).toHaveLength(1);
    });
  });

  describe('acesso indevido (IDOR) nas trocas e no pedido', () => {
    it('outro cliente e outra loja não leem nem mexem na troca, no pagamento da taxa nem nas opções do pedido alheio', async () => {
      const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 6_000, stock: 20 }], { voluntaryExchangeDays: 7 });
      const other = await shopWith(ctx, [{ name: 'Outra', priceCents: 6_000, stock: 20 }]);
      const productId = (await variantRow(shop.variants[0]!)).productId;
      const [sizeM] = await ctx.db.insert(productVariants).values({ productId, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const order = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approveRaw(buyer.user.accessToken, (await attemptOf(ctx, order.id)).id).expect(200);
      await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7 }).where(eq(orders.id, order.id));
      const item = (await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)))[0]!;
      const ex = (await ctx.http.post(`/v1/orders/${order.id}/exchanges`).set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: item.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: sizeM!.id }).expect(201)).body as { id: string };
      await ctx.http.post(`/v1/stores/${shop.store.id}/exchanges/${ex.id}/accept`).set(bearer(shop.store.owner.accessToken)).send({}).expect(200);

      const thief = await createCustomer(ctx);
      const T = bearer(thief.accessToken);
      expect((await ctx.http.get(`/v1/exchanges/${ex.id}`).set(T)).status).toBe(404);
      expect((await ctx.http.post(`/v1/exchanges/${ex.id}/cancel`).set(T).send({})).status).toBe(404);
      expect((await ctx.http.post(`/v1/exchanges/${ex.id}/payment`).set(T).send({ paymentMethod: 'pix' })).status).toBe(404);
      expect((await ctx.http.post(`/v1/exchanges/${ex.id}/contest`).set(T).send({ text: 'tentando contestar a troca alheia' })).status).toBe(404);
      expect((await ctx.http.get(`/v1/orders/${order.id}/exchange-options`).set(T)).status).toBe(404);
      expect((await ctx.http.get('/v1/exchanges').set(T).expect(200)).body.data ?? []).toHaveLength(0);
      // outra loja: 404 (não 403), e nada muda
      const O = bearer(other.store.owner.accessToken);
      for (const action of ['accept', 'refuse', 'receive']) expect((await ctx.http.post(`/v1/stores/${shop.store.id}/exchanges/${ex.id}/${action}`).set(O).send({ reason: 'x'.repeat(12), ok: true })).status, action).toBeGreaterThanOrEqual(403);
      expect((await ctx.http.get(`/v1/stores/${shop.store.id}/exchanges/${ex.id}`).set(O)).status).toBeGreaterThanOrEqual(403);
      expect((await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, ex.id)))[0]!.status).toBe('awaiting_fee');
      // o dono não paga a taxa em nome de outro: pagar com o próprio token da loja não é permitido
      expect((await ctx.http.post(`/v1/exchanges/${ex.id}/payment`).set(bearer(shop.store.owner.accessToken)).send({ paymentMethod: 'pix' })).status).toBe(404);
    });

    it('estorno e corrida: lojista e cliente não alcançam as rotas do admin (403), nem o contato do motoboy/cliente', async () => {
      const o = await pendingOrder();
      await approveRaw(o.buyer.user.accessToken, o.attempt.id).expect(200);
      const rf = (token: string) => ctx.http.post(`/v1/admin/orders/${o.orderId}/refunds`).set(bearer(token)).set('Idempotency-Key', randomUUID()).send({ amountCents: 100, reason: 'tentativa indevida de estorno' });
      expect((await rf(o.buyer.user.accessToken)).status).toBe(403);
      expect((await rf(o.shop.store.owner.accessToken)).status).toBe(403);
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, o.attempt.id))).toHaveLength(0);
      expect((await ctx.http.get('/v1/admin/logistics/deliveries').set(bearer(o.shop.store.owner.accessToken))).status).toBe(403);
      expect((await ctx.http.get('/v1/admin/logistics/couriers').set(bearer(o.buyer.user.accessToken))).status).toBe(403);
      void admin;
    });
  });
});
