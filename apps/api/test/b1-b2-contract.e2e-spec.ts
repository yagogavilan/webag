import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { deliveries, exchangeRequests, orderItems, orders, paymentAlerts, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, cartView, customerAt, placeOrder, shopWith } from './helpers/orders.js';

const DAY = 86_400_000;

describe('Lacunas B.1 (troca e pedido) e B.2 (cartão na página segura)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  async function deliveredOrder(opts: { voluntaryDays?: number; deliveredAgoMs?: number; unitCents?: number } = {}) {
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: opts.unitCents ?? 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const [order] = await ctx.db.select().from(orders).where(eq(orders.id, created.id));
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - (opts.deliveredAgoMs ?? DAY)), exchangeVoluntaryDays: opts.voluntaryDays ?? 7, deliverySnapshot: { ...(order!.deliverySnapshot ?? {}), exchangeFeeCents: 900, expectedCostCents: 700 } }).where(eq(orders.id, created.id));
    return { shop, buyer, orderId: created.id };
  }

  describe('B.1 diferença de preço, prazo e "não recebi"', () => {
    it('exchange-options mostra o preço de cada variação e a diferença (paga ou recebe) antes de pedir', async () => {
      const d = await deliveredOrder();
      const [variant] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, d.shop.variants[0]!));
      const [dearer] = await ctx.db.insert(productVariants).values({ productId: variant!.productId, storeId: d.shop.store.id, attributes: { Tamanho: 'G' }, attributesKey: `tamanho=g-${randomUUID()}`, priceCents: 9_500, stock: 5, reserved: 0 }).returning();
      const [cheaper] = await ctx.db.insert(productVariants).values({ productId: variant!.productId, storeId: d.shop.store.id, attributes: { Tamanho: 'P' }, attributesKey: `tamanho=p-${randomUUID()}`, priceCents: 7_000, stock: 5, reserved: 0 }).returning();
      const opts = (await ctx.http.get(`/v1/orders/${d.orderId}/exchange-options`).set(bearer(d.buyer.user.accessToken)).expect(200)).body;
      const byId = new Map<string, { price: { amount: number }; priceDifference: { amount: number; currency: string }; current: boolean }>(opts.items[0].variants.map((v: { variantId: string }) => [v.variantId, v]));
      expect(byId.get(dearer!.id)).toMatchObject({ price: { amount: 9_500 }, priceDifference: { amount: 1_500, currency: 'BRL' }, current: false }); // cliente paga
      expect(byId.get(cheaper!.id)).toMatchObject({ price: { amount: 7_000 }, priceDifference: { amount: -1_000 } }); // cliente recebe
      expect(byId.get(variant!.id)).toMatchObject({ current: true, priceDifference: { amount: 0 } });
      // O valor mostrado é o que a aprovação congela.
      const item = (await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, d.orderId)))[0]!;
      const ex = (await ctx.http.post(`/v1/orders/${d.orderId}/exchanges`).set(bearer(d.buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: item.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: dearer!.id }).expect(201)).body as { id: string };
      const accepted = await ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${ex.id}/accept`).set(bearer(d.shop.store.owner.accessToken)).send({}).expect(200);
      expect(accepted.body).toMatchObject({ difference: { amount: 1_500 }, fee: { amount: 900 }, totalDue: { amount: 2_400 } });
    });

    it('o pedido traz os prazos finais da troca ("Troca até DD/MM") desde a entrada; não entregue vem sem prazo', async () => {
      const d = await deliveredOrder({ voluntaryDays: 10, deliveredAgoMs: 2 * DAY });
      const order = (await ctx.http.get(`/v1/orders/${d.orderId}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body;
      const deliveredAt = (await ctx.db.select().from(orders).where(eq(orders.id, d.orderId)))[0]!.deliveredAt!.getTime();
      expect(order.exchange).toMatchObject({ canRequest: true });
      expect(new Date(order.exchange.withdrawalUntil).getTime()).toBe(deliveredAt + 7 * DAY);
      expect(new Date(order.exchange.voluntaryUntil).getTime()).toBe(deliveredAt + 10 * DAY);
      expect(new Date(order.exchange.defectUntil).getTime()).toBeGreaterThan(deliveredAt + 29 * DAY);
      const expired = await deliveredOrder({ voluntaryDays: 0, deliveredAgoMs: 120 * DAY });
      expect((await ctx.http.get(`/v1/orders/${expired.orderId}`).set(bearer(expired.buyer.user.accessToken)).expect(200)).body.exchange).toMatchObject({ canRequest: false, voluntaryUntil: null });
      await ctx.db.update(orders).set({ status: 'received', deliveredAt: null }).where(eq(orders.id, d.orderId));
      expect((await ctx.http.get(`/v1/orders/${d.orderId}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body.exchange).toEqual({ canRequest: false, withdrawalUntil: null, voluntaryUntil: null, defectUntil: null });
    });

    it('"levar à loja" depois de aprovada: troca a coleta pelo balcão, zera a taxa e gera o código; taxa paga e motoboy a caminho recusam; IDOR 404', async () => {
      const d = await deliveredOrder();
      const item = (await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, d.orderId)))[0]!;
      const [variant] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, d.shop.variants[0]!));
      const [sizeM] = await ctx.db.insert(productVariants).values({ productId: variant!.productId, storeId: d.shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
      const ex = (await ctx.http.post(`/v1/orders/${d.orderId}/exchanges`).set(bearer(d.buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: item.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: sizeM!.id }).expect(201)).body as { id: string };
      const drop = (token = d.buyer.user.accessToken, id = ex.id) => ctx.http.post(`/v1/exchanges/${id}/drop-at-store`).set(bearer(token)).send({});
      expect((await drop()).body.code).toBe('EXCHANGE_NOT_SWITCHABLE'); // ainda "requested": a loja não aprovou
      await ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${ex.id}/accept`).set(bearer(d.shop.store.owner.accessToken)).send({}).expect(200);
      expect((await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, ex.id)))[0]).toMatchObject({ status: 'awaiting_fee', feeCents: 900, method: 'pickup_at_home' });
      await drop((await createCustomer(ctx)).accessToken).expect(404); // outra conta

      const switched = (await drop().expect(200)).body;
      expect(switched).toMatchObject({ status: 'approved', method: 'drop_at_store', fee: { amount: 0 }, totalDue: { amount: 0 } });
      expect(switched.storeCode).toMatch(/^[A-Z2-9]{6}$/);
      expect((await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, ex.id))).every((r) => r.status === 'cancelled')).toBe(true); // sem corrida ativa
      await drop().expect(200); // idempotente

      // Com taxa já paga: 409 com orientação.
      const paid = await deliveredOrder();
      const paidItem = (await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, paid.orderId)))[0]!;
      const [pv] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, paid.shop.variants[0]!));
      const [m2] = await ctx.db.insert(productVariants).values({ productId: pv!.productId, storeId: paid.shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
      const ex2 = (await ctx.http.post(`/v1/orders/${paid.orderId}/exchanges`).set(bearer(paid.buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: paidItem.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: m2!.id }).expect(201)).body as { id: string };
      await ctx.http.post(`/v1/stores/${paid.shop.store.id}/exchanges/${ex2.id}/accept`).set(bearer(paid.shop.store.owner.accessToken)).send({}).expect(200);
      await ctx.http.post(`/v1/exchanges/${ex2.id}/payment`).set(bearer(paid.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
      const [attempt] = (await ctx.db.execute<{ id: string }>(`select id from payment_attempts where external_reference = 'exchange:${ex2.id}' limit 1` as never)).rows;
      await approve(ctx, paid.buyer.user, attempt!.id);
      expect((await drop(paid.buyer.user.accessToken, ex2.id)).body.code).toBe('EXCHANGE_FEE_ALREADY_PAID');
      // DT-062 / DEC-062: a admin também não isenta a taxa já paga (409; a saída é cancelar a troca e pedir de novo)
      const { createAdmin } = await import('./helpers/fixtures.js');
      const opsAdmin = await createAdmin(ctx, 'operations');
      const waived = await ctx.http.post(`/v1/admin/exchange-requests/${ex2.id}/waive-fee`).set(bearer(opsAdmin.accessToken)).send({ reason: 'Cliente ligou pedindo para isentar a taxa' });
      expect(waived.status).toBe(409);
      expect(waived.body.code).toBe('EXCHANGE_FEE_ALREADY_PAID');
      expect(waived.body.detail).toContain('Cancele a troca');
      // Coleta já em andamento: o motoboy não pode ser desfeito.
      await ctx.db.update(deliveries).set({ status: 'out_for_delivery' }).where(eq(deliveries.exchangeId, ex2.id));
      expect((await drop(paid.buyer.user.accessToken, ex2.id)).status).toBe(409);
    });

    it('"não recebi meu pedido": só com o pedido a caminho ou até 48 h depois de entregue; avisa a operação uma vez; IDOR 404', async () => {
      const shop = await shopWith(ctx, [{ name: 'Bolsa', priceCents: 5_000, stock: 9 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string; number: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      const report = (token = buyer.user.accessToken) => ctx.http.post(`/v1/orders/${created.id}/not-received`).set(bearer(token)).send({});

      expect((await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(buyer.user.accessToken)).expect(200)).body.allowedActions).not.toContain('report_not_received');
      expect((await report()).body.code).toBe('ORDER_NOT_REPORTABLE'); // pedido ainda recebido pela loja

      await ctx.db.update(orders).set({ status: 'out_for_delivery' }).where(eq(orders.id, created.id));
      expect((await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(buyer.user.accessToken)).expect(200)).body.allowedActions).toContain('report_not_received');
      await report((await createCustomer(ctx)).accessToken).expect(404);
      expect((await report().expect(202)).body).toEqual({ reported: true });
      await report().expect(202); // idempotente
      const alerts = (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'order_not_received'))).filter((a) => (a.details as { orderId: string }).orderId === created.id);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.details).toMatchObject({ orderNumber: created.number, storeId: shop.store.id });

      // Entregue há 1 dia: ainda vale; há 3 dias: não.
      await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - DAY) }).where(eq(orders.id, created.id));
      expect((await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(buyer.user.accessToken)).expect(200)).body.allowedActions).toContain('report_not_received');
      await ctx.db.update(orders).set({ deliveredAt: new Date(Date.now() - 3 * DAY) }).where(eq(orders.id, created.id));
      expect((await report()).body.code).toBe('ORDER_NOT_REPORTABLE');
      const audit = (await ctx.http.get('/v1/admin/audit-log?action=order.not_received_reported').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body.data as { targetId: string }[];
      expect(audit.some((a) => a.targetId === created.id)).toBe(true);
    });
  });

  describe('B.2 intenção de cartão para a página segura', () => {
    async function intentFor() {
      const shop = await shopWith(ctx, [{ name: 'Item Cartão', priceCents: 6_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const view = await cartView(ctx, user, addressId);
      const res = await ctx.http.post('/v1/card-intents').set(bearer(user.accessToken)).send({ mode: 'delivery', addressId, cartRevision: view.revision, expectedTotalCents: view.totalCents });
      return { shop, user, addressId, view, res };
    }
    const tokenOf = (url: string) => new URL(url).searchParams.get('i')!;

    it('SEC-171: o CPF do pagador NÃO fica em claro no Redis e chega ao pedido (como HMAC) quando a página conclui', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item CPF', priceCents: 6_000, stock: 5 }]);
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const view = await cartView(ctx, user, addressId);
      const cpf = '52998224725';
      const res = await ctx.http.post('/v1/card-intents').set(bearer(user.accessToken)).send({ mode: 'delivery', addressId, cartRevision: view.revision, expectedTotalCents: view.totalCents, payerDocument: cpf });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const keys = await ctx.redis.keys('card-intent:*');
      const raws = await Promise.all(keys.map((k) => ctx.redis.get(k)));
      expect(raws.filter((r) => r?.includes(user.userId)).every((r) => !r!.includes(cpf))).toBe(true);
      const paid = await ctx.http.post(`/v1/card-intents/${tokenOf(res.body.url as string)}/pay`).send({ card: { token: 'fake_tok_approved', installments: 1 } }).expect(200);
      expect((await ctx.db.select().from(orders).where(eq(orders.id, paid.body.orderId)))[0]!.payerDocumentHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('o app cria a intenção (login obrigatório); a página lê o valor sem login; o link é de uso único e cria o pedido do DONO da intenção', async () => {
      await ctx.http.post('/v1/card-intents').send({}).expect(401);
      const { shop, user, view, res } = await intentFor();
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({ amount: { amount: view.totalCents, currency: 'BRL' } });
      expect(res.body.url).toMatch(/\/pagar\/cartao\?i=[A-Za-z0-9_-]{40,}$/);
      const token = tokenOf(res.body.url as string);

      // A página (sem login) lê só o valor e o provedor.
      const page = (await ctx.http.get(`/v1/card-intents/${token}`).expect(200)).body;
      // D-09: o máximo de parcelas vem dos parâmetros (`parcelas_max` 3, parcela mínima de R$ 30) e do total desta intenção.
      const expectedMax = [3, 2].find((n) => Math.floor(view.totalCents / n) >= 3000) ?? 1;
      expect(page).toMatchObject({ amount: { amount: view.totalCents }, provider: 'fake', installmentsMax: expectedMax, installmentMinCents: 3000 });
      expect(JSON.stringify(page)).not.toContain(user.userId);
      expect(JSON.stringify(page)).not.toContain(shop.store.id);
      await ctx.http.get('/v1/card-intents/token-que-nao-existe-00000000').expect(410);

      // Concluir: token de teste do provedor fake; cria o pedido da conta que pediu a intenção.
      expect((await ctx.http.post(`/v1/card-intents/${token}/pay`).send({ card: { token: 'curto' } })).status).toBe(400);
      const paid = await ctx.http.post(`/v1/card-intents/${token}/pay`).send({ card: { token: 'fake_tok_approved', installments: 1 } }).expect(200);
      expect(paid.body).toMatchObject({ status: 'received', payment: { method: 'card', status: 'approved' } });
      const mine = await ctx.db.select().from(orders).where(eq(orders.userId, user.userId));
      expect(mine.map((o) => o.id)).toEqual([paid.body.orderId]);
      // Uso único: a 2ª tentativa e a leitura depois de usado dão 410, e nada é criado em dobro.
      expect((await ctx.http.post(`/v1/card-intents/${token}/pay`).send({ card: { token: 'fake_tok_approved', installments: 1 } }).expect(410)).body.code).toBe('CARD_INTENT_INVALID');
      await ctx.http.get(`/v1/card-intents/${token}`).expect(410);
      expect(await ctx.db.select().from(orders).where(eq(orders.userId, user.userId))).toHaveLength(1);
    });

    it('duas conclusões simultâneas: só uma cria pedido; 3DS devolve a URL do desafio; cartão recusado é 422 e a intenção não serve de novo', async () => {
      const racing = await intentFor();
      const token = tokenOf(racing.res.body.url as string);
      const pay = () => ctx.http.post(`/v1/card-intents/${token}/pay`).send({ card: { token: 'fake_tok_approved', installments: 1 } });
      const results = await Promise.all([pay(), pay()]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
      expect(await ctx.db.select().from(orders).where(eq(orders.userId, racing.user.userId))).toHaveLength(1);

      const three = await intentFor();
      const threeDs = await ctx.http.post(`/v1/card-intents/${tokenOf(three.res.body.url as string)}/pay`).send({ card: { token: 'fake_tok_3ds', installments: 1 } }).expect(200);
      expect(threeDs.body).toMatchObject({ status: 'awaiting_payment', threeDsUrl: expect.stringContaining('3ds') });

      const declined = await intentFor();
      const declinedToken = tokenOf(declined.res.body.url as string);
      expect((await ctx.http.post(`/v1/card-intents/${declinedToken}/pay`).send({ card: { token: 'fake_tok_insufficient', installments: 1 } })).body.code).toBe('PAYMENT_DECLINED');
      await ctx.http.post(`/v1/card-intents/${declinedToken}/pay`).send({ card: { token: 'fake_tok_approved', installments: 1 } }).expect(410); // pede nova intenção
    });

    it('sessão encerrada ou sacola que mudou: a página não cria pedido; intenção ligada ao total que o cliente viu (SEC-147)', async () => {
      const loggedOut = await intentFor();
      await ctx.http.post('/v1/auth/logout').set(bearer(loggedOut.user.accessToken)).send({ refreshToken: loggedOut.user.refreshToken }).expect(204);
      expect((await ctx.http.post(`/v1/card-intents/${tokenOf(loggedOut.res.body.url as string)}/pay`).send({ card: { token: 'fake_tok_approved', installments: 1 } })).status).toBe(410);
      expect(await ctx.db.select().from(orders).where(eq(orders.userId, loggedOut.user.userId))).toHaveLength(0);

      const stale = await intentFor();
      await addToCart(ctx, stale.user, stale.shop.variants[0]!, 2).expect(200); // a sacola mudou depois da intenção
      const res = await ctx.http.post(`/v1/card-intents/${tokenOf(stale.res.body.url as string)}/pay`).send({ card: { token: 'fake_tok_approved', installments: 1 } });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await ctx.db.select().from(orders).where(eq(orders.userId, stale.user.userId))).toHaveLength(0);
    });
  });
});
