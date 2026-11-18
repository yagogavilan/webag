import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/ledger.service.js';
import { CommissionService } from '../src/modules/finance/commission.service.js';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { carts, couponRedemptions, orderEvents, orderItems, orders, paymentRefunds, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, makeCoupon, orderRow, placeOrder, shopWith } from './helpers/orders.js';

describe('Pedido: criação, reserva de estoque, pagamento, cancelamento e timeouts (WB-023 a WB-030, RN-05 a RN-08)', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  let ordersService: OrdersService;
  let payments: PaymentsService;
  let fake: FakePaymentProvider;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ledger = ctx.app.get(LedgerService);
    ordersService = ctx.app.get(OrdersService);
    payments = ctx.app.get(PaymentsService);
    fake = ctx.app.get(FakePaymentProvider);
  });
  afterAll(() => ctx.close());

  const variantRow = async (id: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, id)))[0]!;

  describe('criação com PIX', () => {
    it('cria o pedido, reserva o estoque, devolve o PIX e esvazia a sacola; repetir a mesma chave devolve o MESMO pedido', async () => {
      const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 10_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 2).expect(200);
      const key = randomUUID();
      const first = await placeOrder(ctx, user, addressId, {}, key);
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      expect(first.body).toMatchObject({ status: 'awaiting_payment', mode: 'delivery', summary: { subtotal: { amount: 20_000 }, delivery: { amount: 500 }, total: { amount: 20_500 } }, allowedActions: ['cancel', 'contact_store'], payment: { method: 'pix', status: 'pending' } });
      expect(first.body.number).toMatch(/^WB-[A-Z2-9]{5}$/);
      expect(first.body.items[0]).toMatchObject({ name: 'Camiseta', quantity: 2, unitPrice: { amount: 10_000 }, lineTotal: { amount: 20_000 } });
      expect(first.body.timeline).toMatchObject([{ status: 'awaiting_payment', actor: 'customer' }]);
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 5, reserved: 2 });

      const pay = (await ctx.http.get(`/v1/orders/${first.body.id}/payment`).set(bearer(user.accessToken)).expect(200)).body;
      expect(pay).toMatchObject({ method: 'pix', status: 'pending', amount: { amount: 20_500 }, pix: { copyPaste: expect.stringContaining('000201') } });
      expect(new Date(pay.pix.expiresAt).getTime()).toBeGreaterThan(Date.now() + 10 * 60_000);
      expect((await ctx.db.select().from(carts).where(eq(carts.userId, user.userId)))[0]!.storeId).toBeNull();

      // repetição (3G): mesma chave e mesmo corpo → 200 e o mesmo pedido, sem nova reserva nem nova cobrança
      const revision = first.body.id ? (await ctx.db.select().from(orders).where(eq(orders.id, first.body.id)))[0]!.cartRevision : 0;
      const again = await ctx.http.post('/v1/orders').set(bearer(user.accessToken)).set('Idempotency-Key', key).send({ mode: 'delivery', addressId, cartRevision: revision, paymentMethod: 'pix' });
      expect(again.status).toBe(200);
      expect(again.body.id).toBe(first.body.id);
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ reserved: 2 });
      expect(await ctx.db.select().from(orders).where(eq(orders.userId, user.userId))).toHaveLength(1);
      // mesma chave com outro corpo: 409
      const reused = await ctx.http.post('/v1/orders').set(bearer(user.accessToken)).set('Idempotency-Key', key).send({ mode: 'pickup', cartRevision: revision, paymentMethod: 'pix' });
      expect(reused.status).toBe(409);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('sem Idempotency-Key é 400; sem login 401; sacola vazia 422; revisão velha 409 CART_CHANGED com o que mudou', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 2_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await ctx.http.post('/v1/orders').send({}).expect(401);
      await ctx.http.post('/v1/orders').set(bearer(user.accessToken)).send({ mode: 'delivery', addressId, cartRevision: 0, paymentMethod: 'pix' }).expect(400);
      expect((await placeOrder(ctx, user, addressId)).body).toMatchObject({ code: 'EMPTY_CART', status: 422 });
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const stale = await ctx.http.post('/v1/orders').set(bearer(user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'delivery', addressId, cartRevision: 0, paymentMethod: 'pix' });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('CART_CHANGED');
      // preço mudou depois que o cliente viu: CART_CHANGED com PRICE_CHANGED e nada cobrado
      const { products } = await import('../src/platform/database/schema.js');
      await ctx.db.update(products).set({ basePriceCents: 2_500 }).where(eq(products.id, shop.store.productIds[0]!));
      const changed = await placeOrder(ctx, user, addressId);
      expect(changed.status).toBe(409);
      expect(changed.body.changes[0]).toMatchObject({ kind: 'PRICE_CHANGED', fromCents: 2_000, toCents: 2_500 });
      expect(await ctx.db.select().from(orders).where(eq(orders.userId, user.userId))).toHaveLength(0);
      // total esperado diferente do calculado (frete mudou): 409 sem cobrar
      await ctx.http.post('/v1/cart/acknowledge').set(bearer(user.accessToken)).expect(200);
      const wrongTotal = await placeOrder(ctx, user, addressId, { expectedTotalCents: 1 });
      expect(wrongTotal.status).toBe(409);
      expect(wrongTotal.body.changes[0].toCents).toBe(3_000);
    });

    it('valor vem do servidor: nenhum campo de preço é aceito no corpo', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 2_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const res = await placeOrder(ctx, user, addressId, { totalCents: 1, items: [] });
      expect(res.status).toBe(400);
    });

    it('retirada: sem frete, com código só depois de pago', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }], { pickupEnabled: true });
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const revision = (await ctx.http.get('/v1/cart?mode=pickup').set(bearer(user.accessToken)).expect(200)).body.revision;
      const res = await ctx.http.post('/v1/orders').set(bearer(user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'pickup', cartRevision: revision, paymentMethod: 'pix' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({ mode: 'pickup', delivery: null, summary: { delivery: { amount: 0 }, total: { amount: 3_000 } } });
      expect(res.body.pickup.code).toBeNull();
      await approve(ctx, user, (await attemptOf(ctx, res.body.id)).id);
      const paid = (await ctx.http.get(`/v1/orders/${res.body.id}`).set(bearer(user.accessToken)).expect(200)).body;
      expect(paid.pickup.code).toMatch(/^\d{4}$/);
      expect(addressId).toBeDefined();
    });
  });

  describe('pagamento aprovado (webhook): estoque, ledger, split e idempotência', () => {
    it('aprovado: recebido, baixa de estoque, ledger fecha, application_fee = comissão e tarifa do provedor lançada', async () => {
      const shop = await shopWith(ctx, [{ name: 'Tênis', priceCents: 10_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      const attempt = await attemptOf(ctx, created.id);
      expect(attempt).toMatchObject({ amountCents: 10_500, applicationFeeCents: 1_000, storeId: shop.store.id });
      await approve(ctx, user, attempt.id);

      const order = (await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(user.accessToken)).expect(200)).body;
      expect(order.status).toBe('received');
      expect(order.timeline.map((t: { status: string }) => t.status)).toEqual(['awaiting_payment', 'received']);
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 4, reserved: 0 });
      const row = await orderRow(ctx, created.id);
      expect(row).toMatchObject({ stockState: 'sold', commissionCents: 1_000, applicationFeeCents: 1_000 });
      expect(row.acceptDeadlineAt!.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
      const balances = await ledger.balances(created.id);
      // venda 105,00: loja 100,00 - comissão 10,00 + frete 5,00 = 95,00 antes da tarifa; tarifa PIX 0,99% de 105,00 = 1,04
      expect(balances).toMatchObject({ paidCents: 10_500, commissionRevenue: 1_000, providerFeeCents: 1_04, merchantPayable: 9_500 - 104 });
      expect((await ledger.verifyOrder(created.id)).ok).toBe(true);
    });

    it('webhook repetido (mesmo request-id) e reentregue com outro request-id: um único efeito (idempotência 2x)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 2).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      const attempt = await attemptOf(ctx, created.id);
      await fake.simulate(attempt.providerPaymentId!, { outcome: 'approved' });
      const n1 = fake.signedNotification(attempt.providerPaymentId!, 'payment.updated');
      const send = (n: typeof n1) => ctx.http.post(`/v1/webhooks/fake?data.id=${attempt.providerPaymentId}&type=payment`).set(n.headers).send({});
      expect((await send(n1).expect(200)).body).toEqual({ received: true, duplicate: false });
      expect((await send(n1).expect(200)).body).toEqual({ received: true, duplicate: true });
      await send(fake.signedNotification(attempt.providerPaymentId!, 'payment.updated')).expect(200);
      await payments.processDue();
      await payments.drain();
      await payments.processDue();
      expect((await orderRow(ctx, created.id)).status).toBe('received');
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 3, reserved: 0 });
      const lines = await ledger.lines(created.id);
      expect(lines.filter((l) => l.kind === 'sale' && l.account === 'provider_clearing')).toHaveLength(1);
      expect((await ctx.db.select().from(orderEvents).where(eq(orderEvents.orderId, created.id))).filter((e) => e.toStatus === 'received')).toHaveLength(1);
    });

    it('fora de ordem: evento de "expirado" chegando DEPOIS da aprovação não derruba o pedido pago', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      const attempt = await attemptOf(ctx, created.id);
      await approve(ctx, user, attempt.id);
      // notificação atrasada de um estado anterior: o servidor re-consulta o provedor (aprovado) e nada regride
      const stale = fake.signedNotification(attempt.providerPaymentId!, 'payment.updated');
      await ctx.http.post(`/v1/webhooks/fake?data.id=${attempt.providerPaymentId}&type=payment`).set(stale.headers).send({ status: 'expired' }).expect(200);
      await payments.processDue();
      await payments.drain();
      expect((await orderRow(ctx, created.id)).status).toBe('received');
      // e a conciliação também não muda nada
      await payments.reconcile(new Date(Date.now() + 60 * 60_000));
      expect((await orderRow(ctx, created.id)).status).toBe('received');
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 4, reserved: 0 });
    });

    it('PIX tardio: pedido expirou, estoque voltou; pagamento que chega depois é estornado sozinho e o pedido segue expirado', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      const attempt = await attemptOf(ctx, created.id);
      await ctx.http.post(`/v1/dev/payments/${attempt.id}/expire`).set(bearer(user.accessToken)).send({}).expect(200);
      expect((await orderRow(ctx, created.id)).status).toBe('expired');
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 5, reserved: 0 });
      await approve(ctx, user, attempt.id);
      const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id));
      expect(refunds).toHaveLength(1);
      expect(refunds[0]!.amountCents).toBe(4_500);
      expect((await orderRow(ctx, created.id)).status).toBe('expired');
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 5, reserved: 0 });
    });
  });

  describe('estoque concorrente', () => {
    it('6 clientes disputam as 3 últimas unidades: exatamente 3 pedidos e 3 recusas "acabou o estoque"', async () => {
      const shop = await shopWith(ctx, [{ name: 'Última peça', priceCents: 5_000, stock: 3 }]);
      const buyers = await Promise.all(Array.from({ length: 6 }, async () => {
        const c = await customerAt(ctx, shop.origin);
        await addToCart(ctx, c.user, shop.variants[0]!, 1).expect(200);
        return c;
      }));
      const results = await Promise.all(buyers.map((b) => placeOrder(ctx, b.user, b.addressId)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      const lost = results.filter((r) => r.status === 409);
      expect(lost).toHaveLength(3);
      expect(lost.every((r) => r.body.code === 'STOCK_CONFLICT')).toBe(true);
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 3, reserved: 3 });
      // quem perdeu não ficou com pedido aberto nem cobrança
      const open = await ctx.db.select().from(orders).where(eq(orders.storeId, shop.store.id));
      expect(open).toHaveLength(3);
    });
  });

  describe('cartão (token do checkout, nunca número)', () => {
    const cardOrder = async (token: string) => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 4 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const res = await placeOrder(ctx, user, addressId, { paymentMethod: 'card', card: { token, installments: 1 } });
      return { shop, user, addressId, res };
    };

    it('aprovado na hora: pedido já nasce pago, com baixa de estoque e tarifa de 4,98%', async () => {
      const { shop, res } = await cardOrder('fake_tok_approved');
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({ status: 'received', payment: { method: 'card', status: 'approved' } });
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 3, reserved: 0 });
      expect((await ledger.balances(res.body.id)).providerFeeCents).toBe(Math.round((6_500 * 498) / 10_000));
    });

    it('recusado: 422 PAYMENT_DECLINED com texto seguro, pedido expirado, estoque devolvido e a sacola continua', async () => {
      const { shop, user, res } = await cardOrder('fake_tok_insufficient');
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'PAYMENT_DECLINED', detail: expect.stringContaining('Saldo insuficiente') });
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 4, reserved: 0 });
      const mine = await ctx.db.select().from(orders).where(eq(orders.userId, user.userId));
      expect(mine.map((o) => o.status)).toEqual(['expired']);
      expect((await ctx.http.get('/v1/cart').set(bearer(user.accessToken)).expect(200)).body.items).toHaveLength(1);
    });

    it('3DS: pedido aguarda e o app recebe a URL do desafio; timeout do provedor: 503 e nenhum pedido aberto', async () => {
      const three = await cardOrder('fake_tok_3ds');
      expect(three.res.status).toBe(201);
      expect(three.res.body.status).toBe('awaiting_payment');
      const pay = (await ctx.http.get(`/v1/orders/${three.res.body.id}/payment`).set(bearer(three.user.accessToken)).expect(200)).body;
      expect(pay).toMatchObject({ status: 'pending_3ds', threeDsUrl: expect.stringContaining('3ds'), pix: null });

      const slow = await cardOrder('fake_tok_timeout');
      expect(slow.res.status).toBe(503);
      expect(slow.res.body.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      expect((await ctx.db.select().from(orders).where(eq(orders.userId, slow.user.userId)))[0]!.status).toBe('expired');
      expect(await variantRow(slow.shop.variants[0]!)).toMatchObject({ reserved: 0 });
    });

    it('cartão sem token é 400 e PIX com cartão também', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 1_000, stock: 4 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      expect((await placeOrder(ctx, user, addressId, { paymentMethod: 'card' })).status).toBe(400);
      expect((await placeOrder(ctx, user, addressId, { paymentMethod: 'pix', card: { token: 'fake_tok_approved', installments: 1 } })).status).toBe(400);
    });
  });

  describe('comissão e cupons no pedido', () => {
    it('comissão da loja congelada por item e cupom da plataforma LIMITADO à comissão (DEC-016, SEC-060)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 5 }]);
      await ctx.app.get(CommissionService).setStoreRate(shop.store.id, { pctBp: 500, reason: 'negociação teste' }, null);
      const coupon = await makeCoupon(ctx, { kind: 'percent', scope: 'platform', value: 50 }); // 50% = 5.000 de face; comissão 5% = 500
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      await ctx.http.put('/v1/cart/coupon').set(bearer(user.accessToken)).send({ code: coupon.code }).expect(200);
      const res = await placeOrder(ctx, user, addressId);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.summary).toMatchObject({ discount: { amount: 500 }, platformDiscountCapped: true, total: { amount: 10_000 - 500 + 500 } });
      const row = await orderRow(ctx, res.body.id);
      expect(row).toMatchObject({ commissionCents: 500, platformDiscountCents: 500, applicationFeeCents: 0, storeCouponCents: 0 });
      expect((await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, row.id)))[0]!.commissionPctBp).toBe(500);
      // a Webag não paga ao lojista por fora: receita zero, nunca negativa
      await approve(ctx, user, (await attemptOf(ctx, row.id)).id);
      const b = await ledger.balances(row.id);
      expect(b.commissionRevenue - b.platformPromoExpense).toBe(0);
      expect((await ledger.verifyOrder(row.id)).ok).toBe(true);
    });

    it('cupom da loja reduz a base da comissão; limite de usos sob concorrência: só um pedido leva o último uso', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 5 }]);
      const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'store', storeId: shop.store.id, value: 1_000, maxUses: 1 });
      const a = await customerAt(ctx, shop.origin);
      const b = await customerAt(ctx, shop.origin);
      for (const c of [a, b]) {
        await addToCart(ctx, c.user, shop.variants[0]!, 1).expect(200);
        await ctx.http.put('/v1/cart/coupon').set(bearer(c.user.accessToken)).send({ code: coupon.code }).expect(200);
      }
      const [ra, rb] = await Promise.all([placeOrder(ctx, a.user, a.addressId), placeOrder(ctx, b.user, b.addressId)]);
      const winners = [ra, rb].filter((r) => r.status === 201);
      expect(winners).toHaveLength(1);
      expect([ra, rb].filter((r) => r.status === 422)[0]!.body.code).toBe('COUPON_EXHAUSTED');
      const row = await orderRow(ctx, winners[0]!.body.id);
      expect(row).toMatchObject({ storeCouponCents: 1_000, commissionCents: 900, applicationFeeCents: 900, totalCents: 10_000 - 1_000 + 500 });
      expect(await ctx.db.select().from(couponRedemptions).where(eq(couponRedemptions.couponId, coupon.id))).toHaveLength(1);
    });
  });

  describe('cancelamento e estorno', () => {
    it('cancelar aguardando pagamento: libera estoque e cupom, sem estorno; repetir é idempotente', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
      const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'store', storeId: shop.store.id, value: 500 });
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 2).expect(200);
      await ctx.http.put('/v1/cart/coupon').set(bearer(user.accessToken)).send({ code: coupon.code }).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ reserved: 2 });
      const cancelled = await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(user.accessToken)).send({ reason: 'desisti' }).expect(200);
      expect(cancelled.body).toMatchObject({ status: 'cancelled', cancellation: { by: 'customer', reason: 'desisti' }, allowedActions: [] });
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 5, reserved: 0 });
      expect((await ctx.db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, created.id)))[0]!.releasedAt).not.toBeNull();
      await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(user.accessToken)).send({}).expect(200);
      expect(await ctx.db.select().from(paymentRefunds)).toBeDefined();
    });

    it('cancelar pedido pago: estorno total automático, estoque devolvido, ledger zerado e sem comissão', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      const attempt = await attemptOf(ctx, created.id);
      await approve(ctx, user, attempt.id);
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 4 });
      const res = await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(user.accessToken)).send({}).expect(200);
      expect(res.body.status).toBe('cancelled');
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 5, reserved: 0 });
      const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id));
      expect(refunds.map((r) => r.amountCents)).toEqual([8_500]);
      expect((await fake.getPayment(attempt.providerPaymentId!))?.refundedCents).toBe(8_500);
      const b = await ledger.balances(created.id);
      expect(b).toMatchObject({ refundedCents: 8_500, commissionRevenue: 0, serviceFeeRevenue: 0, providerClearing: 0 - b.providerFeeCents });
      expect((await ledger.verifyOrder(created.id)).ok).toBe(true);
      // repetir o cancelamento: 200 e nenhum segundo estorno
      await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(user.accessToken)).send({}).expect(200);
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(1);
    });

    it('depois da separação o cliente não cancela: 409 ORDER_NOT_CANCELLABLE (RN-08)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      await approve(ctx, user, (await attemptOf(ctx, created.id)).id);
      await ctx.db.update(orders).set({ status: 'in_preparation' }).where(eq(orders.id, created.id));
      const res = await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(user.accessToken)).send({}).expect(409);
      expect(res.body.code).toBe('ORDER_NOT_CANCELLABLE');
    });

    it('estorno que falha no provedor fica pendente e é concluído pela conciliação (nunca se perde)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      const attempt = await attemptOf(ctx, created.id);
      await approve(ctx, user, attempt.id);
      const { ProviderTimeoutError } = await import('../src/modules/payments/payment-provider.js');
      const { vi } = await import('vitest');
      vi.spyOn(fake, 'refund').mockRejectedValueOnce(new ProviderTimeoutError());
      await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(user.accessToken)).send({}).expect(200);
      expect((await orderRow(ctx, created.id)).status).toBe('cancelled');
      expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id))).toHaveLength(0);
      vi.restoreAllMocks();
      await payments.reconcile(new Date(Date.now() + 10 * 60_000));
      expect((await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id)))[0]!.amountCents).toBe(8_500);
      expect((await ledger.balances(created.id)).refundedCents).toBe(8_500);
    });
  });

  describe('prazos: PIX vencido e timeout de aceite da loja', () => {
    it('PIX vencido: o sweep expira o pedido e devolve o estoque', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 2).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ reserved: 2 });
      const early = await ordersService.sweep(new Date());
      expect(early.expiredPix).toBe(0);
      await ordersService.sweep(new Date(Date.now() + 16 * 60_000));
      const order = await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(user.accessToken)).expect(200);
      expect(order.body.status).toBe('expired');
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 5, reserved: 0 });
    });

    it('loja não aceita em 10 min: cancelamento pelo sistema com estorno total e estoque devolvido', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      const attempt = await attemptOf(ctx, created.id);
      await approve(ctx, user, attempt.id);
      expect((await ordersService.sweep(new Date())).acceptTimeouts).toBe(0);
      expect((await ordersService.sweep(new Date(Date.now() + 11 * 60_000))).acceptTimeouts).toBeGreaterThanOrEqual(1);
      const order = (await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(user.accessToken)).expect(200)).body;
      expect(order).toMatchObject({ status: 'cancelled', cancellation: { by: 'system', reason: 'A loja não respondeu a tempo' } });
      expect((await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id)))[0]!.amountCents).toBe(4_500);
      expect(await variantRow(shop.variants[0]!)).toMatchObject({ stock: 5, reserved: 0 });
      expect((await ledger.verifyOrder(created.id)).ok).toBe(true);
    });
  });

  describe('acesso: pedido é do dono (IDOR, SEC-020)', () => {
    it('outra conta recebe 404 em detalhe, pagamento e cancelamento, e não vê o pedido na lista', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
      const owner = await customerAt(ctx, shop.origin);
      await addToCart(ctx, owner.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, owner.user, owner.addressId)).body;
      const other = await registerUser(ctx);
      await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(other.accessToken)).expect(404);
      await ctx.http.get(`/v1/orders/${created.id}/payment`).set(bearer(other.accessToken)).expect(404);
      await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(other.accessToken)).send({}).expect(404);
      await ctx.http.get(`/v1/orders/${randomUUID()}`).set(bearer(owner.user.accessToken)).expect(404);
      await ctx.http.get('/v1/orders/nao-e-uuid').set(bearer(owner.user.accessToken)).expect(404);
      expect((await ctx.http.get('/v1/orders').set(bearer(other.accessToken)).expect(200)).body.data).toEqual([]);
      expect((await orderRow(ctx, created.id)).status).toBe('awaiting_payment');
      // endereço de outra conta no pedido: 404
      const stranger = await customerAt(ctx, shop.origin);
      const res = await ctx.http.post('/v1/orders').set(bearer(owner.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'delivery', addressId: stranger.addressId, cartRevision: 1, paymentMethod: 'pix' });
      expect(res.status).toBe(404);
    });

    it('lista paginada por cursor, mais recentes primeiro, com filtro ativo/encerrado', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 1_000, stock: 20 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
        ids.push((await placeOrder(ctx, user, addressId)).body.id);
      }
      await ctx.http.post(`/v1/orders/${ids[0]}/cancel`).set(bearer(user.accessToken)).send({}).expect(200);
      const p1 = (await ctx.http.get('/v1/orders?limit=2').set(bearer(user.accessToken)).expect(200)).body;
      expect(p1.data.map((o: { id: string }) => o.id)).toEqual([ids[4], ids[3]]);
      const p2 = (await ctx.http.get(`/v1/orders?limit=2&cursor=${p1.nextCursor}`).set(bearer(user.accessToken)).expect(200)).body;
      const p3 = (await ctx.http.get(`/v1/orders?limit=2&cursor=${p2.nextCursor}`).set(bearer(user.accessToken)).expect(200)).body;
      expect([...p1.data, ...p2.data, ...p3.data].map((o: { id: string }) => o.id)).toEqual([...ids].reverse());
      expect(p3.nextCursor).toBeNull();
      expect((await ctx.http.get('/v1/orders?scope=past').set(bearer(user.accessToken)).expect(200)).body.data.map((o: { id: string }) => o.id)).toEqual([ids[0]]);
      expect((await ctx.http.get('/v1/orders?scope=active').set(bearer(user.accessToken)).expect(200)).body.data).toHaveLength(4);
      expect(p1.data[0]).toMatchObject({ itemCount: 1, firstItemName: 'Item', total: { amount: 1_500 } });
    });
  });

  describe('produto com pedido em andamento (WB-060 C5)', () => {
    it('o catálogo enxerga o pedido aberto e deixa de ver quando ele encerra', async () => {
      const { ProductOrdersPort } = await import('../src/modules/catalog/index.js');
      const port = ctx.app.get(ProductOrdersPort);
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 1_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      expect(await port.hasOpenOrders(shop.store.productIds[0]!)).toBe(false);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, user, addressId)).body;
      expect(await port.hasOpenOrders(shop.store.productIds[0]!)).toBe(true);
      await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(user.accessToken)).send({}).expect(200);
      expect(await port.hasOpenOrders(shop.store.productIds[0]!)).toBe(false);
    });
  });

  describe('e-mail não confirmado (DEC-014)', () => {
    it('no máximo 1 pedido pago antes de confirmar o e-mail', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 1_000, stock: 20 }]);
      const user = await registerUser(ctx);
      const addr = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street: 'Rua Teste', number: '10', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: shop.origin.lat, lng: shop.origin.lng }).expect(201);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const first = await placeOrder(ctx, user, addr.body.id);
      expect(first.status).toBe(201);
      await approve(ctx, user, (await attemptOf(ctx, first.body.id)).id);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const second = await placeOrder(ctx, user, addr.body.id);
      expect(second.status).toBe(422);
      expect(second.body.code).toBe('EMAIL_UNVERIFIED');
    });
  });
});
