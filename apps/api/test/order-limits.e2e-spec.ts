import { eq, inArray } from 'drizzle-orm';
import { auditLog, paymentAlerts, paymentAttempts, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** WB-225 / BUG-009 / SEC-062 (loja nova), SEC-131 (teto de pendentes e PIX/h), SEC-133 e SEC-134 (conferência do pagamento). */
describe('Limites de pedido e conferência do pagamento (revisão de segurança da Onda 4A)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  describe('limite de exposição da loja nova (WB-225)', () => {
    it('loja aprovada há 90 dias: sem limite; loja nova: o teto vale na sacola e no pedido, e o admin libera ou ajusta com motivo e auditoria', async () => {
      const old = await shopWith(ctx, [{ name: 'Caro', priceCents: 80_000, stock: 5 }]);
      const oldBuyer = await customerAt(ctx, old.origin);
      await addToCart(ctx, oldBuyer.user, old.variants[0]!, 1).expect(200);
      expect((await placeOrder(ctx, oldBuyer.user, oldBuyer.addressId)).status).toBe(201);

      const fresh = await shopWith(ctx, [{ name: 'Item', priceCents: 40_000, stock: 50 }], { approvedDaysAgo: 2 });
      const admin = await createAdmin(ctx, 'operations');
      const url = `/v1/admin/stores/${fresh.store.id}/exposure-limit`;
      const lojista = bearer(fresh.store.owner.accessToken);
      expect((await ctx.http.get(`/v1/stores/${fresh.store.id}/exposure-limit`).set(lojista).expect(200)).body).toMatchObject({ active: true, mode: 'default', maxOrder: { amount: 50_000 }, deliveredOrders: 0, ordersToEnd: 20 });

      const buyer = await customerAt(ctx, fresh.origin);
      await addToCart(ctx, buyer.user, fresh.variants[0]!, 1).expect(200); // 40.000 + frete 5,00 + taxas = dentro do teto
      expect((await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body.checkout.blockers).not.toContain('NEW_STORE_LIMIT');
      await addToCart(ctx, buyer.user, fresh.variants[0]!, 2).expect(200); // 80.000: acima de R$ 500
      const cart = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
      expect(cart.checkout).toMatchObject({ canCheckout: false, blockers: expect.arrayContaining(['NEW_STORE_LIMIT']), newStoreMaxOrder: { amount: 50_000 } });
      const blocked = await placeOrder(ctx, buyer.user, buyer.addressId);
      expect(blocked.status).toBe(422);
      expect(blocked.body.code).toBe('NEW_STORE_LIMIT');
      expect(blocked.body.detail).toMatch(/R\$\s*500,00/);

      // só admin com permissão; lojista não altera o próprio limite
      await ctx.http.put(url).set(lojista).send({ mode: 'released', reason: 'quero vender mais' }).expect(403);
      const support = await createAdmin(ctx, 'support');
      await ctx.http.put(url).set(bearer(support.accessToken)).send({ mode: 'released', reason: 'teste de perfil' }).expect(403);
      await ctx.http.put(url).set(bearer(admin.accessToken)).send({ mode: 'released' }).expect(400); // motivo é obrigatório
      await ctx.http.put(url).set(bearer(admin.accessToken)).send({ mode: 'custom', reason: 'sem valor' }).expect(400);
      expect((await ctx.http.put(url).set(bearer(admin.accessToken)).send({ mode: 'custom', maxOrderCents: 100_000, reason: 'loja conhecida do bairro' }).expect(200)).body).toMatchObject({ mode: 'custom', maxOrder: { amount: 100_000 } });
      expect((await placeOrder(ctx, buyer.user, buyer.addressId)).status).toBe(201); // 80.000 + extras < 100.000
      expect((await ctx.http.put(url).set(bearer(admin.accessToken)).send({ mode: 'released', reason: 'documentação conferida' }).expect(200)).body).toMatchObject({ active: false, maxOrder: null });
      const audits = await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, fresh.store.id));
      expect(audits.filter((a) => a.action === 'store.exposure_limit.set')).toHaveLength(2);
    });

    it('conta só pedidos ENTREGUES da própria loja para encerrar o limite (a regra dos 20 pedidos tem teste unitário)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 40_000, stock: 50 }], { approvedDaysAgo: 2 });
      const url = `/v1/stores/${shop.store.id}/exposure-limit`;
      const owner = bearer(shop.store.owner.accessToken);
      const { orders } = await import('../src/platform/database/schema.js');
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body;
      expect((await ctx.http.get(url).set(owner).expect(200)).body).toMatchObject({ deliveredOrders: 0, ordersToEnd: 20 }); // pendente não conta
      await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, created.id));
      expect((await ctx.http.get(url).set(owner).expect(200)).body).toMatchObject({ active: true, deliveredOrders: 1, ordersToEnd: 19 });
      const other = await shopWith(ctx, [{ name: 'Outro', priceCents: 40_000, stock: 5 }], { approvedDaysAgo: 2 });
      expect((await ctx.http.get(`/v1/stores/${other.store.id}/exposure-limit`).set(bearer(other.store.owner.accessToken)).expect(200)).body.deliveredOrders).toBe(0);
      // o dono de uma loja não lê o limite de outra (404 do guard)
      await ctx.http.get(`/v1/stores/${other.store.id}/exposure-limit`).set(owner).expect(404);
    });
  });

  describe('teto de pedidos pendentes e de PIX por hora (SEC-131)', () => {
    it('o 3º pedido aguardando pagamento da mesma conta dá 429; pagar ou cancelar libera', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 50 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
        const res = await placeOrder(ctx, user, addressId);
        expect(res.status).toBe(201);
        ids.push(res.body.id as string);
      }
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const third = await placeOrder(ctx, user, addressId);
      expect(third.status).toBe(429);
      expect(third.body.code).toBe('TOO_MANY_PENDING_ORDERS');
      expect(third.headers['retry-after']).toBeDefined();
      await ctx.http.post(`/v1/orders/${ids[0]}/cancel`).set(bearer(user.accessToken)).send({ reason: 'desisti' });
      expect((await placeOrder(ctx, user, addressId)).status).toBe(201);
    });

    it('mais de 5 PIX por hora na mesma conta: 429 mesmo sem pedidos pendentes', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 50 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      for (let i = 0; i < 5; i++) {
        await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
        const res = await placeOrder(ctx, user, addressId);
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        await ctx.http.post(`/v1/orders/${res.body.id}/cancel`).set(bearer(user.accessToken)).send({ reason: 'desisti' }).expect(200);
      }
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const sixth = await placeOrder(ctx, user, addressId);
      expect(sixth.status).toBe(429);
      expect(sixth.body.code).toBe('TOO_MANY_PIX_ORDERS');
    });

    it('conta sem e-mail confirmado: o pedido pendente conta junto com os pagos (DEC-014)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 50 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      const { users } = await import('../src/platform/database/schema.js');
      await ctx.db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, user.userId));
      await ctx.redis.flushdb();
      const fresh = (await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password })).body as { accessToken?: string };
      const token = fresh.accessToken ?? user.accessToken;
      const session = { ...user, accessToken: token };
      await addToCart(ctx, session, shop.variants[0]!, 1).expect(200);
      expect((await placeOrder(ctx, session, addressId)).status).toBe(201);
      await addToCart(ctx, session, shop.variants[0]!, 1).expect(200);
      const second = await placeOrder(ctx, session, addressId);
      expect(second.status).toBe(422);
      expect(second.body.code).toBe('EMAIL_UNVERIFIED');
    });
  });

  describe('conferência do pagamento (SEC-133, SEC-134)', () => {
    it('SEC-133: cartão aprovado na criação com comissão e recebedor errados NÃO paga o pedido; fica divergente com alerta', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 10 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const res = await placeOrder(ctx, user, addressId, { paymentMethod: 'card', card: { token: 'fake_tok_wrong_fee', installments: 1 } });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.status).toBe('awaiting_payment');
      const attempt = await attemptOf(ctx, res.body.id);
      expect(attempt.status).toBe('divergent');
      const alerts = await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.attemptId, attempt.id));
      expect(alerts.map((a) => a.kind)).toContain('conciliation_mismatch');
      expect(JSON.stringify(alerts[0]!.details)).toMatch(/application_fee/);
      expect((await orderRow(ctx, res.body.id)).paidAt).toBeNull();
    });

    it('SEC-134: pagamento avulso de valor menor com external_reference do pedido não paga o pedido, alerta e é estornado', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 10 }]);
      const victim = await customerAt(ctx, shop.origin);
      await addToCart(ctx, victim.user, shop.variants[0]!, 1).expect(200);
      const order = (await placeOrder(ctx, victim.user, victim.addressId)).body;
      const attacker = await customerAt(ctx, shop.origin);
      const forged = (await ctx.http.post('/v1/dev/payments').set(bearer(attacker.user.accessToken)).send({ amountCents: 1, method: 'pix', storeId: shop.store.id, externalReference: order.id }).expect(201)).body;
      await ctx.http.post(`/v1/dev/payments/${forged.id}/approve`).set(bearer(attacker.user.accessToken)).send({}).expect(200);
      expect((await orderRow(ctx, order.id)).status).toBe('awaiting_payment');
      const alerts = await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.attemptId, forged.id));
      expect(alerts.map((a) => a.kind)).toContain('order_attempt_mismatch');
      expect(await ctx.db.select().from(paymentRefunds).where(inArray(paymentRefunds.attemptId, [forged.id]))).toHaveLength(1);
      // o pagamento verdadeiro do pedido continua funcionando
      const real = await attemptOf(ctx, order.id);
      expect(real.id).not.toBe(forged.id);
      await ctx.http.post(`/v1/dev/payments/${real.id}/approve`).set(bearer(victim.user.accessToken)).send({}).expect(200);
      expect((await orderRow(ctx, order.id)).status).toBe('received');
      expect((await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, real.id)))[0]!.status).toBe('approved');
    });
  });
});
