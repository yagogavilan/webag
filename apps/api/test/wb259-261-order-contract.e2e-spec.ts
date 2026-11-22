import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { paymentRefundIntents } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, cartView, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** WB-259 (F3) `Order.refund` e WB-261 (F6a) `409 ETA_CHANGED` com `acceptedEtaToAt` (DEC-065, decisão do CEO). */
describe('Contrato do pedido: estorno (WB-259) e horário mudou (WB-261)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => ctx.close());

  async function paidOrder(price = 8_000) {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: price, stock: 5 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body;
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    return { shop, buyer, orderId: created.id as string };
  }

  describe('Order.refund', () => {
    it('sem estorno: nulo (pedido sem pagamento e pedido pago em andamento)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body;
      expect(created.refund).toBeNull();
      await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(buyer.user.accessToken)).send({}).expect(200); // nada pago: nada a estornar
      expect((await ctx.http.get(`/v1/orders/${created.id}`).set(bearer(buyer.user.accessToken)).expect(200)).body.refund).toBeNull();
      const paid = await paidOrder();
      expect((await ctx.http.get(`/v1/orders/${paid.orderId}`).set(bearer(paid.buyer.user.accessToken)).expect(200)).body.refund).toBeNull();
    });

    it('cancelamento do pedido pago por PIX: valor total, meio pix, concluído e o prazo em texto fixo', async () => {
      const { buyer, orderId } = await paidOrder(8_000);
      const res = await ctx.http.post(`/v1/orders/${orderId}/cancel`).set(bearer(buyer.user.accessToken)).send({}).expect(200);
      expect(res.body.refund).toEqual({ amountCents: 8_500, method: 'pix', status: 'completed', deadlineText: 'Volta para a conta que pagou o PIX. Costuma levar até 1 dia útil.' });
      const read = await ctx.http.get(`/v1/orders/${orderId}`).set(bearer(buyer.user.accessToken)).expect(200);
      expect(read.body.refund).toMatchObject({ amountCents: 8_500, method: 'pix', status: 'completed' });
    });

    it('intenção ainda por concluir: processing; esgotada: processing; coberta pela Webag: completed', async () => {
      const { buyer, orderId } = await paidOrder(5_000);
      await ctx.http.post(`/v1/orders/${orderId}/cancel`).set(bearer(buyer.user.accessToken)).send({}).expect(200);
      const attempt = await attemptOf(ctx, orderId);
      const read = async () => (await ctx.http.get(`/v1/orders/${orderId}`).set(bearer(buyer.user.accessToken)).expect(200)).body.refund;
      await ctx.db.update(paymentRefundIntents).set({ status: 'pending' }).where(eq(paymentRefundIntents.attemptId, attempt.id));
      expect(await read()).toMatchObject({ amountCents: 5_500, status: 'processing' });
      await ctx.db.update(paymentRefundIntents).set({ status: 'exhausted' }).where(eq(paymentRefundIntents.attemptId, attempt.id));
      expect(await read()).toMatchObject({ status: 'processing' });
      await ctx.db.update(paymentRefundIntents).set({ status: 'covered' }).where(eq(paymentRefundIntents.attemptId, attempt.id));
      expect(await read()).toMatchObject({ status: 'completed' });
    });

    it('estorno parcial: o valor é o parcial, nunca o total do pedido; o meio é o do pagamento (cartão tem o texto das faturas)', async () => {
      const { buyer, orderId } = await paidOrder(6_000);
      const attempt = await attemptOf(ctx, orderId);
      await ctx.db.insert(paymentRefundIntents).values({ attemptId: attempt.id, idempotencyKey: 'wb259-parcial', amountCents: 2_000, reason: 'item indisponível', status: 'done' });
      const refund = (await ctx.http.get(`/v1/orders/${orderId}`).set(bearer(buyer.user.accessToken)).expect(200)).body.refund;
      expect(refund).toMatchObject({ amountCents: 2_000, method: 'pix', status: 'completed' });
      expect(refund.amountCents).toBeLessThan(6_500);
      // cartão: o texto muda com o meio
      const { paymentAttempts } = await import('../src/platform/database/schema.js');
      await ctx.db.update(paymentAttempts).set({ method: 'card' }).where(eq(paymentAttempts.id, attempt.id));
      expect((await ctx.http.get(`/v1/orders/${orderId}`).set(bearer(buyer.user.accessToken)).expect(200)).body.refund).toMatchObject({ method: 'card', deadlineText: 'Aparece na fatura do cartão em até 2 faturas, conforme o seu banco.' });
    });

    it('só a dona vê o estorno: outra conta recebe 404', async () => {
      const { orderId } = await paidOrder();
      const stranger = (await customerAt(ctx, (await shopWith(ctx, [{ name: 'Item X', priceCents: 1_000 }])).origin)).user;
      await ctx.http.get(`/v1/orders/${orderId}`).set(bearer(stranger.accessToken)).expect(404);
    });
  });

  describe('POST /v1/orders com acceptedEtaToAt', () => {
    async function cartReady() {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 20 }]);
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const cart = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
      return { buyer, eta: cart.delivery.eta as { fromAt: string; toAt: string; maxMinutes: number } };
    }

    it('o fim da faixa que o cliente viu: cria sem aviso; sem o campo (app antigo) também; fim aceito mais tarde que o novo (melhorou) também', async () => {
      const exact = await cartReady();
      expect(exact.eta.toAt).toBeTruthy();
      const ok = await placeOrder(ctx, exact.buyer.user, exact.buyer.addressId, { acceptedEtaToAt: exact.eta.toAt });
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      const old = await cartReady();
      expect((await placeOrder(ctx, old.buyer.user, old.buyer.addressId)).status).toBe(201);
      const early = await cartReady();
      const better = await placeOrder(ctx, early.buyer.user, early.buyer.addressId, { acceptedEtaToAt: new Date(Date.parse(early.eta.toAt) + 60 * 60_000).toISOString() });
      expect(better.status, JSON.stringify(better.body)).toBe(201);
    });

    it('fim novo pior que o aceito: 409 ETA_CHANGED com eta {fromAt,toAt}, nenhum pedido criado; reenviar com o toAt novo cria', async () => {
      const { buyer, eta } = await cartReady();
      const before = await ctx.http.get('/v1/orders?scope=active').set(bearer(buyer.user.accessToken)).expect(200);
      const stale = new Date(Date.parse(eta.toAt) - 20 * 60_000).toISOString(); // o cliente viu um fim 20 min mais cedo
      const res = await placeOrder(ctx, buyer.user, buyer.addressId, { acceptedEtaToAt: stale });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'ETA_CHANGED', status: 409 });
      expect(Date.parse(res.body.eta.toAt)).toBeGreaterThan(Date.parse(stale) + 5 * 60_000);
      expect(Date.parse(res.body.eta.fromAt)).toBeLessThan(Date.parse(res.body.eta.toAt));
      const after = await ctx.http.get('/v1/orders?scope=active').set(bearer(buyer.user.accessToken)).expect(200);
      expect(after.body.data).toHaveLength(before.body.data.length); // nenhum pedido nasceu
      // o cliente confirma: o app reenvia com o fim novo (e chave nova) e o pedido é criado
      const accepted = await placeOrder(ctx, buyer.user, buyer.addressId, { acceptedEtaToAt: res.body.eta.toAt });
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
      const row = await orderRow(ctx, accepted.body.id);
      expect(row.etaToAt).not.toBeNull();
    });

    it('A-03: repetição com a MESMA chave e outro acceptedEtaToAt (a faixa andou com o relógio) devolve o mesmo pedido (200), não 409 IDEMPOTENCY_KEY_REUSED; outro campo do corpo continua 409', async () => {
      const { buyer, eta } = await cartReady();
      const key = randomUUID();
      const { revision, totalCents } = await cartView(ctx, buyer.user, buyer.addressId);
      const send = (over: Record<string, unknown>) => ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', key).send({ mode: 'delivery', addressId: buyer.addressId, cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix', ...over });
      const first = await send({ acceptedEtaToAt: eta.toAt });
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      const again = await send({ acceptedEtaToAt: new Date(Date.parse(eta.toAt) + 3 * 60_000).toISOString() });
      expect(again.status, JSON.stringify(again.body)).toBe(200);
      expect(again.body.id).toBe(first.body.id);
      expect((await send({})).status).toBe(200); // sem o campo (app antigo) também
      expect((await send({ mode: 'pickup', addressId: undefined })).body.code).toBe('IDEMPOTENCY_KEY_REUSED'); // o resto do corpo segue na impressão digital
    });

    it('o limite é só de piora: dentro de 5 min a mais não avisa (o horário anda com o relógio)', async () => {
      const { buyer, eta } = await cartReady();
      const slightly = new Date(Date.parse(eta.toAt) - 2 * 60_000).toISOString();
      const res = await placeOrder(ctx, buyer.user, buyer.addressId, { acceptedEtaToAt: slightly });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    });

    it('valor inválido: 400', async () => {
      const { buyer } = await cartReady();
      const bad = await placeOrder(ctx, buyer.user, buyer.addressId, { acceptedEtaToAt: 'amanhã' });
      expect(bad.status).toBe(400);
    });
  });

  describe('W.8 readyByAt (DEC-064c): "Marque pronto até" = pagamento aprovado + preparo da loja', () => {
    it('no painel da loja (lista e detalhe) vale paidAt + o preparo gravado no pedido; some depois do "pronto"; só a loja vê', async () => {
      const { shop, orderId } = await paidOrder(5_000);
      const row = await orderRow(ctx, orderId);
      const prep = (row.deliverySnapshot as { eta: { prepMin: number } }).eta.prepMin;
      expect(prep).toBeGreaterThan(0);
      const expected = new Date(row.paidAt!.getTime() + prep * 60_000).toISOString();
      const base = `/v1/stores/${shop.store.id}/orders`;
      const owner = bearer(shop.store.owner.accessToken);
      const listed = (await ctx.http.get(base).set(owner).expect(200)).body.data.find((o: { id: string }) => o.id === orderId);
      expect(listed.readyByAt).toBe(expected);
      await ctx.http.post(`${base}/${orderId}/accept`).set(owner).expect(200);
      expect((await ctx.http.get(`${base}/${orderId}`).set(owner).expect(200)).body.readyByAt).toBe(expected); // aceito: segue valendo
      await ctx.http.post(`${base}/${orderId}/status`).set(owner).send({ status: 'in_preparation' }).expect(200);
      expect((await ctx.http.get(`${base}/${orderId}`).set(owner).expect(200)).body.readyByAt).toBe(expected);
      await ctx.http.post(`${base}/${orderId}/status`).set(owner).send({ status: 'ready_for_collection' }).expect(200);
      expect((await ctx.http.get(`${base}/${orderId}`).set(owner).expect(200)).body.readyByAt).toBeNull(); // já marcou pronto
      // o cliente não recebe esse campo (é do painel da loja)
      const customerView = (await ctx.http.get(`/v1/orders/${orderId}`).set(bearer((await customerAt(ctx, shop.origin)).user.accessToken))).status;
      expect(customerView).toBe(404);
    });
  });
});
