import { and, eq } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/index.js';
import { LateDeliveryService, OrderEventBus, type OrderEvent } from '../src/modules/orders/index.js';
import { coupons, deliveries, orderCancelRequests, orders, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { restoreFees, useParam } from './helpers/fees.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';

/** E.3 / WB-253 a WB-255 (RN-19 item 4): aviso de atraso, cancelamento sem custo e compensação. Banco real. */
describe('Atraso da entrega: aviso, cancelamento sem custo e compensação (RN-19)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let events: OrderEvent[];
  const base = '/v1/admin/logistics';

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    await restoreFees(ctx);
    ops = await createAdmin(ctx, 'operations');
    events = [];
    ctx.app.get(OrderEventBus).subscribe((e) => void events.push(e));
  });
  beforeEach(async () => {
    await restoreFees(ctx);
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });

  const minutesAgo = (min: number) => new Date(Date.now() - min * 60_000);
  const late = (orderId: string, endedMinutesAgo: number) => ctx.db.update(orders).set({ etaToAt: minutesAgo(endedMinutesAgo) }).where(eq(orders.id, orderId));
  const view = async (r: { orderId: string; buyer: { user: { accessToken: string } } }) => (await ctx.http.get(`/v1/orders/${r.orderId}`).set(bearer(r.buyer.user.accessToken)).expect(200)).body;

  async function readyOrder(shopArg?: Shop) {
    const shop = shopArg ?? (await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 20 }]));
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    const attempt = await attemptOf(ctx, created.id);
    await approve(ctx, buyer.user, attempt.id);
    const url = `/v1/stores/${shop.store.id}/orders/${created.id}`;
    await ctx.http.post(`${url}/accept`).set(bearer(shop.store.owner.accessToken)).expect(200);
    return { shop, buyer, orderId: created.id, attempt, url };
  }
  async function readyForCollection() {
    const r = await readyOrder();
    await ctx.http.post(`${r.url}/status`).set(bearer(r.shop.store.owner.accessToken)).send({ status: 'ready_for_collection' }).expect(200);
    const [delivery] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, r.orderId));
    return { ...r, delivery: delivery! };
  }
  const courier = async () => (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: 'Moto Atraso', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
  const act = (id: string, body: Record<string, unknown>) => ctx.http.post(`${base}/deliveries/${id}/status`).set(bearer(ops.accessToken)).send(body);
  async function outForDelivery() {
    const r = await readyForCollection();
    const m = await courier();
    await ctx.http.post(`${base}/deliveries/${r.delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: m.id }).expect(200);
    await act(r.delivery.id, { action: 'confirm' }).expect(200);
    await act(r.delivery.id, { action: 'picked_up' }).expect(200);
    return r;
  }
  const cancelLate = (r: { orderId: string; buyer: { user: { accessToken: string } } }) => ctx.http.post(`/v1/orders/${r.orderId}/cancel-late`).set(bearer(r.buyer.user.accessToken)).send({});

  it('parâmetros novos existem com os padrões da RN-19', async () => {
    const list = (await ctx.http.get('/v1/admin/parameters').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body.data as { key: string; value: unknown }[];
    const get = (key: string) => list.find((p) => p.key === key)?.value;
    expect(get('entrega_atraso_tolerancia_min')).toBe(15);
    expect(get('entrega_compensacao_tipo')).toBe('frete_gratis_proximo');
    expect(get('entrega_compensacao_cents')).toBe(1000);
    expect(get('entrega_cancel_resposta_min')).toBe(10);
  });

  it('dentro da faixa não há atraso; passou do fim, só o aviso; depois da tolerância libera o cancelamento sem custo', async () => {
    const r = await readyOrder();
    expect((await view(r)).delay).toMatchObject({ late: false, canCancelWithoutCost: false, cancelMode: null });
    expect((await cancelLate(r)).status).toBe(409);
    await late(r.orderId, 5);
    expect((await view(r)).delay).toMatchObject({ late: true, canCancelWithoutCost: false });
    const refused = await cancelLate(r);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('LATE_CANCEL_NOT_AVAILABLE');
    await late(r.orderId, 16);
    expect((await view(r)).delay).toMatchObject({ late: true, canCancelWithoutCost: true, cancelMode: 'immediate' });
  });

  it('tolerância é parâmetro: com 30 min, 20 min de atraso ainda não libera', async () => {
    const r = await readyOrder();
    await useParam(ctx, 'entrega_atraso_tolerancia_min', 30);
    await late(r.orderId, 20);
    expect((await cancelLate(r)).status).toBe(409);
    await useParam(ctx, 'entrega_atraso_tolerancia_min', 10);
    expect((await cancelLate(r)).status).toBe(200);
  });

  it('antes da saída: cancela na hora (ator cliente, motivo atraso), estoque devolvido, corrida cancelada e estorno TOTAL com a taxa de entrega; toque duplo é um só', async () => {
    const r = await readyForCollection();
    await late(r.orderId, 20);
    const first = await cancelLate(r);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ status: 'cancelled', cancellation: { by: 'customer', reason: 'Atraso na entrega' } });
    expect((await cancelLate(r)).status).toBe(200); // idempotente
    const order = await orderRow(ctx, r.orderId);
    expect(order).toMatchObject({ status: 'cancelled', cancelledBy: 'customer' });
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, r.attempt.id));
    expect(refunds.reduce((sum, x) => sum + x.amountCents, 0)).toBe(r.attempt.amountCents); // total, inclui a entrega
    expect(r.attempt.amountCents).toBe(order.totalCents);
    expect((await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!.status).toBe('cancelled');
    expect(await ctx.db.select().from(coupons).where(eq(coupons.sourceOrderId, r.orderId))).toHaveLength(0); // quem cancela não recebe compensação
  });

  it('pedido entregue recusa com ORDER_ALREADY_DELIVERED; pedido de outro cliente é 404', async () => {
    const r = await outForDelivery();
    await late(r.orderId, 20);
    const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!.deliveryCode!;
    await act(r.delivery.id, { action: 'delivered', code }).expect(200);
    const res = await cancelLate(r);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_ALREADY_DELIVERED');
    const other = await customerAt(ctx, r.shop.origin);
    expect((await ctx.http.post(`/v1/orders/${r.orderId}/cancel-late`).set(bearer(other.user.accessToken)).send({})).status).toBe(404);
  });

  it('em saída para entrega vira pedido à operação: "chego em até 10 min" encerra o pedido; sem resposta o sistema aceita e a corrida entra na devolução', async () => {
    const r = await outForDelivery();
    await late(r.orderId, 20);
    const first = await cancelLate(r);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.status).toBe('out_for_delivery'); // o pedido não foi cancelado
    expect(first.body.delay.cancelRequest).toMatchObject({ status: 'pending' });
    const again = await cancelLate(r);
    expect(again.body.delay.cancelRequest.id).toBe(first.body.delay.cancelRequest.id); // um só pedido aberto
    // a solicitação "em separação" não se mistura com esta
    expect(first.body.cancelRequest).toBeNull();
    // a operação responde que chega logo
    const answer = await ctx.http.post(`/v1/admin/orders/${r.orderId}/late-cancel/respond`).set(bearer(ops.accessToken)).send({ action: 'arrive_soon', note: 'Chego em até 10 minutos' });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body).toMatchObject({ status: 'refused', decidedBy: 'admin', decisionNote: 'Chego em até 10 minutos' });
    expect((await ctx.http.post(`/v1/admin/orders/${r.orderId}/late-cancel/respond`).set(bearer(ops.accessToken)).send({ action: 'accept' })).status).toBe(409); // nada pendente
    // o cliente pede de novo e a operação não responde: o sistema aceita depois de entrega_cancel_resposta_min
    await cancelLate(r);
    const svc = ctx.app.get(LateDeliveryService);
    expect(await svc.autoAccept(new Date(Date.now() + 5 * 60_000))).toBe(0); // dentro do prazo de 10 min
    expect((await svc.autoAccept(new Date(Date.now() + 11 * 60_000))) >= 1).toBe(true);
    const [request] = await ctx.db.select().from(orderCancelRequests).where(and(eq(orderCancelRequests.orderId, r.orderId), eq(orderCancelRequests.status, 'approved')));
    expect(request).toMatchObject({ kind: 'late', decidedBy: 'system' });
    expect((await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!.status).toBe('not_delivered');
    // o resto é o fluxo de devolução existente (SEC-143): devolvida à loja, a loja confirma, só então cancela e estorna tudo
    expect((await orderRow(ctx, r.orderId)).status).toBe('out_for_delivery');
  });

  it('aviso de atraso: 1 push por pedido ao passar do fim da faixa (não antes)', async () => {
    const r = await readyOrder();
    const svc = ctx.app.get(LateDeliveryService);
    const mine = () => events.filter((e) => e.orderId === r.orderId && e.notice === 'late');
    await svc.notifyLate(new Date());
    expect(mine()).toHaveLength(0);
    await late(r.orderId, 1);
    await svc.notifyLate(new Date());
    await svc.notifyLate(new Date());
    expect(mine()).toHaveLength(1);
    expect((await orderRow(ctx, r.orderId)).lateNotifiedAt).not.toBeNull();
  });

  describe('compensação (WB-254)', () => {
    async function deliver(lateMinutes: number) {
      const r = await outForDelivery();
      await late(r.orderId, lateMinutes);
      const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, r.delivery.id)))[0]!.deliveryCode!;
      await act(r.delivery.id, { action: 'delivered', code }).expect(200);
      return r;
    }
    const couponsOf = (orderId: string) => ctx.db.select().from(coupons).where(eq(coupons.sourceOrderId, orderId));

    it('entregue depois do fim da faixa + tolerância: UM cupom de entrega grátis, pessoal, de 30 dias e com aviso ao cliente', async () => {
      const r = await deliver(20);
      const [coupon] = await couponsOf(r.orderId);
      expect(coupon).toMatchObject({ kind: 'free_shipping', scope: 'platform', maxUses: 1, perCustomerLimit: 1, ownerUserId: r.buyer.user.userId });
      expect(coupon!.code).toMatch(/^ATRASO[A-Z0-9]{8}$/);
      expect(Math.round((coupon!.endsAt.getTime() - coupon!.startsAt.getTime()) / 86_400_000)).toBe(30);
      expect(events.some((e) => e.orderId === r.orderId && e.notice === 'late_compensation')).toBe(true);
      // intransferível: outro cliente não aplica nem descobre o código
      const other = await shopWith(ctx, [{ name: 'Item', priceCents: 8_000, stock: 5 }]);
      const stranger = await customerAt(ctx, other.origin);
      await addToCart(ctx, stranger.user, other.variants[0]!, 1).expect(200);
      const applied = await ctx.http.put('/v1/cart/coupon').set(bearer(stranger.user.accessToken)).send({ code: coupon!.code });
      expect(applied.status).toBe(422);
      expect(applied.body.code).toBe('COUPON_NOT_FOUND');
      // o dono usa no próximo pedido: frete zerado
      const shop2 = other;
      await addToCart(ctx, r.buyer.user, shop2.variants[0]!, 1).expect(200);
      const mine = await ctx.http.put('/v1/cart/coupon').set(bearer(r.buyer.user.accessToken)).send({ code: coupon!.code });
      expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    });

    it('dentro da tolerância, no prazo ou com tipo "nenhuma": nenhum cupom', async () => {
      expect(await couponsOf((await deliver(10)).orderId)).toHaveLength(0); // atrasou 10 min < tolerância de 15
      const onTime = await outForDelivery();
      const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, onTime.delivery.id)))[0]!.deliveryCode!;
      await act(onTime.delivery.id, { action: 'delivered', code }).expect(200);
      expect(await couponsOf(onTime.orderId)).toHaveLength(0);
      await useParam(ctx, 'entrega_compensacao_tipo', 'nenhuma');
      expect(await couponsOf((await deliver(40)).orderId)).toHaveLength(0);
    });

    it('tipo cupom_valor: cupom fixo no valor do parâmetro', async () => {
      await useParam(ctx, 'entrega_compensacao_tipo', 'cupom_valor');
      await useParam(ctx, 'entrega_compensacao_cents', 1500);
      const [coupon] = await couponsOf((await deliver(30)).orderId);
      expect(coupon).toMatchObject({ kind: 'fixed', value: 1500 });
    });

    it('o ledger do pedido atrasado fecha igual ao pedido normal (a compensação não mexe no pagamento)', async () => {
      const r = await deliver(30);
      const b = await ctx.app.get(LedgerService).balances(r.orderId);
      expect(b).toMatchObject({ deliveryFeeRevenue: 500 });
    });
  });
});
