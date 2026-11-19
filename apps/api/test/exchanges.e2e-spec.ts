import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ParametersService } from '../src/modules/admin/index.js';
import { ExchangesService } from '../src/modules/exchanges/index.js';
import { deliveries, exchangeRequests, orderItems, orders, paymentAlerts, paymentAttempts, paymentRefunds, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, jpegBuffer, memoryStorage, type RegisteredUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith, type Shop } from './helpers/orders.js';

/** T.2/T.3 (DEC-037): fluxo de troca com banco e Redis reais. */
describe('Trocas e devoluções (WB-170 a WB-178, WB-243, WB-245)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  const service = () => ctx.app.get(ExchangesService);
  const owner = (shop: Shop) => bearer(shop.store.owner.accessToken);
  const base = '/v1/admin/logistics';

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ops = await createAdmin(ctx, 'operations');
  });
  afterAll(() => ctx.close());

  /** Pedido pago e ENTREGUE (marcado no banco: o fluxo da logística tem teste próprio) com 2 itens de R$ 80, e variação M no 1º produto. */
  async function delivered(opts: { exchangeFeeCents?: number; voluntaryDays?: number; deliveredAgoDays?: number } = {}) {
    const shop = await shopWith(ctx, [
      { name: 'Camiseta', priceCents: 8_000, stock: 20 },
      { name: 'Bermuda', priceCents: 8_000, stock: 20 },
    ]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    await addToCart(ctx, buyer.user, shop.variants[1]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const [order] = await ctx.db.select().from(orders).where(eq(orders.id, created.id));
    await ctx.db
      .update(orders)
      .set({ status: 'delivered', deliveredAt: new Date(Date.now() - (opts.deliveredAgoDays ?? 1) * 86_400_000), exchangeVoluntaryDays: opts.voluntaryDays ?? 7, deliverySnapshot: { ...(order!.deliverySnapshot ?? {}), exchangeFeeCents: opts.exchangeFeeCents ?? 900, expectedCostCents: 700 } })
      .where(eq(orders.id, created.id));
    const productA = (await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!)))[0]!.productId;
    const [sizeM] = await ctx.db
      .insert(productVariants)
      .values({ productId: productA, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 })
      .returning();
    const rows = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, created.id));
    const itemOf = (variantId: string) => rows.find((r) => r.variantId === variantId)!.id;
    return { shop, buyer, orderId: created.id, sizeM: sizeM!, itemA: itemOf(shop.variants[0]!), itemB: itemOf(shop.variants[1]!), items: rows };
  }
  type Delivered = Awaited<ReturnType<typeof delivered>>;

  const request = (d: Delivered, body: Record<string, unknown>, key: string = randomUUID(), user: RegisteredUser = d.buyer.user) =>
    ctx.http.post(`/v1/orders/${d.orderId}/exchanges`).set(bearer(user.accessToken)).set('Idempotency-Key', key).send(body);
  const sizeRequest = (d: Delivered, over: Record<string, unknown> = {}) => ({ orderItemId: d.itemA, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: d.sizeM.id, ...over });
  const store = (d: Delivered, id: string, action: string, body: Record<string, unknown> = {}) => ctx.http.post(`/v1/stores/${d.shop.store.id}/exchanges/${id}/${action}`).set(owner(d.shop)).send(body);
  const variant = async (id: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, id)))[0]!;
  const exRow = async (id: string) => (await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, id)))[0]!;
  const runsOf = (exchangeId: string) => ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, exchangeId));
  const exchangeAttempts = (exchangeId: string) => ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${exchangeId}`));

  async function courierWalk(deliveryId: string, to: 'delivered'): Promise<void> {
    const courier = (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: 'Carlos Moto Silva', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
    await ctx.http.post(`${base}/deliveries/${deliveryId}/assign`).set(bearer(ops.accessToken)).send({ courierId: courier.id }).expect(200);
    for (const action of ['confirm', 'picked_up', to]) await ctx.http.post(`${base}/deliveries/${deliveryId}/status`).set(bearer(ops.accessToken)).send({ action }).expect(200);
  }

  it('opções mostram prazo e bloqueios; pedido não entregue ou prazo vencido é recusado com código estável', async () => {
    const d = await delivered();
    const opts = (await ctx.http.get(`/v1/orders/${d.orderId}/exchange-options`).set(bearer(d.buyer.user.accessToken)).expect(200)).body;
    const first = opts.items.find((i: { orderItemId: string }) => i.orderItemId === d.itemA);
    expect(first.options.map((o: { type: string }) => o.type)).toEqual(['withdrawal', 'defect', 'size_color']);
    expect(first.options.every((o: { eligible: boolean }) => o.eligible)).toBe(true);
    expect(first.options[2].pickupFee.amount).toBe(900);
    expect(first.variants.some((v: { variantId: string; available: boolean }) => v.variantId === d.sizeM.id && v.available)).toBe(true);

    const late = await delivered({ deliveredAgoDays: 9 }); // arrependimento (7 dias) e tamanho (7) vencidos; defeito segue
    const lateOpts = (await ctx.http.get(`/v1/orders/${late.orderId}/exchange-options`).set(bearer(late.buyer.user.accessToken)).expect(200)).body.items.find((i: { orderItemId: string }) => i.orderItemId === late.itemA).options;
    expect(lateOpts.map((o: { eligible: boolean }) => o.eligible)).toEqual([false, true, false]);
    expect(lateOpts[0].reason.code).toBe('EXCHANGE_WINDOW_EXPIRED');
    const res = await request(late, sizeRequest(late));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EXCHANGE_WINDOW_EXPIRED');

    await ctx.db.update(orders).set({ status: 'received', deliveredAt: null }).where(eq(orders.id, d.orderId));
    expect((await request(d, sizeRequest(d))).body.code).toBe('EXCHANGE_ORDER_NOT_DELIVERED');
  });

  it('tamanho/cor: a taxa NÃO é cobrada ao pedir; só depois da aprovação da loja; pago, a coleta entra na fila e a peça nova só sai depois da conferência', async () => {
    const d = await delivered();
    const res = await request(d, sizeRequest(d));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = res.body.id as string;
    expect(res.body).toMatchObject({ status: 'requested', fee: { amount: 0 }, totalDue: { amount: 0 }, type: 'size_color', method: 'pickup_at_home' });
    expect(await exchangeAttempts(id)).toHaveLength(0); // nada cobrado ao solicitar
    expect((await variant(d.sizeM.id)).reserved).toBe(0); // reserva só na aprovação
    expect((await ctx.http.post(`/v1/exchanges/${id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' })).body.code).toBe('EXCHANGE_NOT_AWAITING_FEE');

    const accepted = await store(d, id, 'accept').expect(200);
    expect(accepted.body).toMatchObject({ status: 'awaiting_fee', fee: { amount: 900 }, totalDue: { amount: 900 }, difference: { amount: 0 } });
    expect((await variant(d.sizeM.id)).reserved).toBe(1); // tamanho novo reservado ao aprovar
    expect(await runsOf(id)).toHaveLength(0); // ainda sem corrida: a taxa está pendente

    const pay = await ctx.http.post(`/v1/exchanges/${id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    expect(pay.body).toMatchObject({ status: 'pending', amount: { amount: 900 } });
    // repetir com o PIX pendente devolve o mesmo pagamento (idempotência), sem cobrar de novo
    await ctx.http.post(`/v1/exchanges/${id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    const attempts = await exchangeAttempts(id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ amountCents: 900, storeId: null, applicationFeeCents: 0 }); // conta da Webag, sem split
    await approve(ctx, d.buyer.user, attempts[0]!.id);

    const paid = (await ctx.http.get(`/v1/exchanges/${id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body;
    expect(paid).toMatchObject({ status: 'approved', feePaid: true });
    const [run] = await runsOf(id);
    expect(run).toMatchObject({ kind: 'exchange_pickup', status: 'ready_for_collection', feeCents: 900, orderId: d.orderId });
    expect(Object.keys(run!.contact as object)).not.toContain('email');

    // coleta: o motoboy leva o item à loja; a loja confere e libera a reentrega (2ª corrida)
    expect((await store(d, id, 'receive', { ok: true })).body.code).toBe('ITEM_NOT_COLLECTED');
    await courierWalk(run!.id, 'delivered');
    expect((await exRow(id)).collectedAt).not.toBeNull();
    const received = await store(d, id, 'receive', { ok: true }).expect(200);
    expect(received.body.status).toBe('item_received');
    const runs = await runsOf(id);
    expect(runs.map((r) => r.kind).sort()).toEqual(['exchange_pickup', 'exchange_return']);
    expect((await variant(d.sizeM.id)).stock).toBe(5); // a peça nova ainda não saiu
    const original = await variant(d.shop.variants[0]!);
    expect(original.stock).toBe(20); // 19 vendidos + 1 devolvida ao estoque

    await courierWalk(runs.find((r) => r.kind === 'exchange_return')!.id, 'delivered');
    expect((await exRow(id)).status).toBe('completed');
    expect(await variant(d.sizeM.id)).toMatchObject({ stock: 4, reserved: 0 }); // baixa definitiva da peça nova
  });

  it('1 troca por pedido (tamanho/cor): a 2ª é recusada; recusa da loja devolve o direito; recusa não gera cobrança', async () => {
    const d = await delivered();
    const first = await request(d, sizeRequest(d)).expect(201);
    const other = await request(d, sizeRequest(d, { orderItemId: d.itemB }));
    expect(other.status).toBe(422);
    expect(other.body.code).toBe('EXCHANGE_VOLUNTARY_LIMIT');
    // arrependimento e defeito NÃO entram no limite
    const photo = await uploadPhoto(d.buyer.user);
    expect((await request(d, { orderItemId: d.itemB, type: 'defect', method: 'drop_at_store', photoIds: [photo] })).status).toBe(201);

    const refused = await store(d, first.body.id, 'refuse', { reason: 'Item usado' }).expect(200);
    expect(refused.body.status).toBe('rejected');
    expect(await exchangeAttempts(first.body.id)).toHaveLength(0);
    expect((await variant(d.sizeM.id)).reserved).toBe(0);
    // a rejeitada não conta: o item A pode pedir de novo
    expect((await request(d, sizeRequest(d))).status).toBe(201);
  });

  it('idempotência: mesma chave devolve a mesma troca (200); outra chave para o mesmo item é recusada; defeito exige foto', async () => {
    const d = await delivered();
    const key = randomUUID();
    const a = await request(d, sizeRequest(d), key).expect(201);
    const again = await request(d, sizeRequest(d), key);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(a.body.id);
    expect(await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.orderId, d.orderId))).toHaveLength(1);
    expect((await request(d, sizeRequest(d))).body.code).toBe('EXCHANGE_ALREADY_OPEN');
    expect((await request(d, { orderItemId: d.itemB, type: 'defect', method: 'drop_at_store' })).status).toBe(400); // sem foto
    expect((await ctx.http.post(`/v1/orders/${d.orderId}/exchanges`).set(bearer(d.buyer.user.accessToken)).send(sizeRequest(d))).status).toBe(400); // sem Idempotency-Key
  });

  it('aprovação automática depois do SLA da loja (ator sistema), com a reserva do tamanho novo; sem estoque cai para reembolso', async () => {
    const d = await delivered();
    const a = await request(d, sizeRequest(d)).expect(201);
    expect(await service().sweep()).toMatchObject({ autoApproved: 0 }); // dentro do prazo, nada acontece
    await ctx.db.update(exchangeRequests).set({ answerDeadlineAt: new Date(Date.now() - 1_000) }).where(eq(exchangeRequests.id, a.body.id));
    expect((await service().sweep()).autoApproved).toBeGreaterThanOrEqual(1);
    const view = (await ctx.http.get(`/v1/exchanges/${a.body.id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body;
    expect(view).toMatchObject({ status: 'awaiting_fee', autoApproved: true, decidedBy: 'system', fee: { amount: 900 } });
    expect(view.timeline.at(-1)).toMatchObject({ actor: 'system' });
    expect((await variant(d.sizeM.id)).reserved).toBe(1);
    await service().sweep();
    expect((await exRow(a.body.id)).status).toBe('awaiting_fee'); // idempotente

    // taxa não paga no prazo: cancela e libera a reserva
    await ctx.db.update(exchangeRequests).set({ feeDueAt: new Date(Date.now() - 1_000) }).where(eq(exchangeRequests.id, a.body.id));
    await service().sweep();
    expect(await exRow(a.body.id)).toMatchObject({ status: 'cancelled' });
    expect((await variant(d.sizeM.id)).reserved).toBe(0);

    // sem estoque no momento da aprovação automática: vira reembolso, nunca prende a troca
    const e = await delivered();
    const b = await request(e, sizeRequest(e)).expect(201);
    await ctx.db.update(productVariants).set({ stock: 0 }).where(eq(productVariants.id, e.sizeM.id));
    await ctx.db.update(exchangeRequests).set({ answerDeadlineAt: new Date(Date.now() - 1_000) }).where(eq(exchangeRequests.id, b.body.id));
    await service().sweep();
    expect(await exRow(b.body.id)).toMatchObject({ status: 'awaiting_fee', resolution: 'refund', newVariantId: null, feeCents: 900, reservationState: 'none' });
    // a loja, ao aprovar à mão, recebe o conflito de estoque
    const f = await delivered();
    const c = await request(f, sizeRequest(f)).expect(201);
    await ctx.db.update(productVariants).set({ stock: 0 }).where(eq(productVariants.id, f.sizeM.id));
    expect((await store(f, c.body.id, 'accept')).body.code).toBe('EXCHANGE_NO_STOCK');
  });

  it('levar à loja é grátis (sem taxa nem corrida): código do balcão, 5 tentativas e a peça nova sai na hora', async () => {
    const d = await delivered();
    const a = await request(d, sizeRequest(d, { method: 'drop_at_store' })).expect(201);
    const accepted = await store(d, a.body.id, 'accept').expect(200);
    expect(accepted.body).toMatchObject({ status: 'approved', fee: { amount: 0 } });
    expect(await runsOf(a.body.id)).toHaveLength(0);
    const code = (await ctx.http.get(`/v1/exchanges/${a.body.id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body.storeCode as string;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(accepted.body.storeCode).toBeNull(); // a loja não vê o código do cliente
    expect((await store(d, a.body.id, 'receive', { ok: true, code: 'AAAAAA' })).body.code).toBe('EXCHANGE_CODE_INVALID');
    await store(d, a.body.id, 'receive', { ok: true, code }).expect(200);
    expect(await exRow(a.body.id)).toMatchObject({ status: 'completed' });
    expect(await variant(d.sizeM.id)).toMatchObject({ stock: 4, reserved: 0 });
    // bloqueio depois de 5 erros
    const e = await delivered();
    const b = await request(e, sizeRequest(e, { method: 'drop_at_store' })).expect(201);
    await store(e, b.body.id, 'accept').expect(200);
    for (let i = 0; i < 5; i += 1) await store(e, b.body.id, 'receive', { ok: true, code: 'AAAAAA' }).expect(422);
    expect((await store(e, b.body.id, 'receive', { ok: true, code: 'AAAAAA' })).status).toBe(429);
  });

  it('diferença de preço: positiva entra na cobrança junto da taxa; negativa é estornada na conferência', async () => {
    const d = await delivered({ exchangeFeeCents: 0 });
    await ctx.db.update(productVariants).set({ priceCents: 9_500 }).where(eq(productVariants.id, d.sizeM.id)); // M custa R$ 15 a mais
    const a = await request(d, sizeRequest(d, { method: 'drop_at_store' })).expect(201);
    const accepted = await store(d, a.body.id, 'accept').expect(200);
    expect(accepted.body).toMatchObject({ status: 'awaiting_fee', fee: { amount: 0 }, difference: { amount: 1_500 }, totalDue: { amount: 1_500 } });
    await approve(ctx, d.buyer.user, (await ctx.http.post(`/v1/exchanges/${a.body.id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200).then(async () => (await exchangeAttempts(a.body.id))[0]!)).id);
    expect((await exRow(a.body.id)).status).toBe('approved');

    const e = await delivered({ exchangeFeeCents: 0 });
    await ctx.db.update(productVariants).set({ priceCents: 7_000 }).where(eq(productVariants.id, e.sizeM.id)); // M custa R$ 10 a menos
    const b = await request(e, sizeRequest(e, { method: 'drop_at_store' })).expect(201);
    const acceptedB = await store(e, b.body.id, 'accept').expect(200);
    expect(acceptedB.body).toMatchObject({ status: 'approved', difference: { amount: -1_000 }, totalDue: { amount: 0 } });
    const code = (await ctx.http.get(`/v1/exchanges/${b.body.id}`).set(bearer(e.buyer.user.accessToken)).expect(200)).body.storeCode as string;
    await store(e, b.body.id, 'receive', { ok: true, code }).expect(200);
    const attempt = await attemptOf(ctx, e.orderId);
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id));
    expect(refunds.map((r) => r.amountCents)).toEqual([1_000]);
  });

  it('arrependimento: aprovado na hora, loja não recusa, e o reembolso inclui a taxa de entrega depois da conferência', async () => {
    const d = await delivered();
    const a = await request(d, { orderItemId: d.itemA, type: 'withdrawal', method: 'pickup_at_home' }).expect(201);
    expect(a.body).toMatchObject({ status: 'approved', fee: { amount: 0 }, decidedBy: 'system', resolution: 'refund' });
    expect(await runsOf(a.body.id)).toHaveLength(1); // coleta grátis na fila
    expect((await store(d, a.body.id, 'refuse', { reason: 'não aceito' })).body.code).toBe('EXCHANGE_CANNOT_REJECT');
    const [run] = await runsOf(a.body.id);
    await courierWalk(run!.id, 'delivered');
    await store(d, a.body.id, 'receive', { ok: true }).expect(200);
    const row = await exRow(a.body.id);
    expect(row.status).toBe('completed');
    const [order] = await ctx.db.select().from(orders).where(eq(orders.id, d.orderId));
    // o outro item do pedido continua com o cliente: só o item volta (a taxa de entrega só no último item)
    const attempt = await attemptOf(ctx, d.orderId);
    const refunds = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id));
    const discountShare = Math.round((order!.discountCents * 8_000) / order!.subtotalCents);
    expect(refunds.map((r) => r.amountCents)).toEqual([8_000 - discountShare]);

    // o segundo item, também por arrependimento: agora a taxa de entrega volta junto
    const b = await request(d, { orderItemId: d.itemB, type: 'withdrawal', method: 'drop_at_store' }).expect(201);
    const code = (await ctx.http.get(`/v1/exchanges/${b.body.id}`).set(bearer(d.buyer.user.accessToken)).expect(200)).body.storeCode as string;
    await store(d, b.body.id, 'receive', { ok: true, code }).expect(200);
    const all = await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt.id));
    expect(all.map((r) => r.amountCents).sort((x, y) => x - y)).toEqual([8_000 - discountShare, 8_000 - discountShare + order!.deliveryFeeCents].sort((x, y) => x - y));
  });

  it('cancelar libera a reserva e estorna a taxa já paga; não cancela depois que o motoboy saiu', async () => {
    const d = await delivered();
    const a = await request(d, sizeRequest(d)).expect(201);
    await store(d, a.body.id, 'accept').expect(200);
    await ctx.http.post(`/v1/exchanges/${a.body.id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    const [attempt] = await exchangeAttempts(a.body.id);
    await approve(ctx, d.buyer.user, attempt!.id);
    const [run] = await runsOf(a.body.id);
    await ctx.http.post(`/v1/exchanges/${a.body.id}/cancel`).set(bearer(d.buyer.user.accessToken)).send({}).expect(200);
    expect(await exRow(a.body.id)).toMatchObject({ status: 'cancelled' });
    expect((await variant(d.sizeM.id)).reserved).toBe(0);
    expect((await ctx.db.select().from(deliveries).where(eq(deliveries.id, run!.id)))[0]!.status).toBe('cancelled');
    expect((await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attempt!.id))).map((r) => r.amountCents)).toEqual([900]);

    const e = await delivered();
    const b = await request(e, { orderItemId: e.itemA, type: 'withdrawal', method: 'pickup_at_home' }).expect(201);
    const [runB] = await runsOf(b.body.id);
    await ctx.http.post(`${base}/deliveries/${runB!.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: 'Moto Dois Santos', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body.id }).expect(200);
    await ctx.http.post(`${base}/deliveries/${runB!.id}/status`).set(bearer(ops.accessToken)).send({ action: 'confirm' }).expect(200);
    expect((await ctx.http.post(`/v1/exchanges/${b.body.id}/cancel`).set(bearer(e.buyer.user.accessToken)).send({})).body.code).toBe('EXCHANGE_NOT_CANCELLABLE');
  });

  it('IDOR: outro cliente e outra loja recebem 404; a fila da loja só mostra as dela; admin sem permissão da loja não aprova', async () => {
    const d = await delivered();
    const a = await request(d, sizeRequest(d)).expect(201);
    const stranger = await createCustomer(ctx);
    expect((await ctx.http.get(`/v1/exchanges/${a.body.id}`).set(bearer(stranger.accessToken))).status).toBe(404);
    expect((await ctx.http.post(`/v1/exchanges/${a.body.id}/cancel`).set(bearer(stranger.accessToken)).send({})).status).toBe(404);
    expect((await ctx.http.get(`/v1/orders/${d.orderId}/exchange-options`).set(bearer(stranger.accessToken))).status).toBe(404);
    expect((await request(d, sizeRequest(d), randomUUID(), stranger)).status).toBe(404);
    expect((await ctx.http.post(`/v1/exchanges/${a.body.id}/payment`).set(bearer(stranger.accessToken)).send({ paymentMethod: 'pix' })).status).toBe(404);
    const other = await delivered();
    const asOtherStore = (action: string, body: Record<string, unknown> = {}) => ctx.http.post(`/v1/stores/${other.shop.store.id}/exchanges/${a.body.id}/${action}`).set(owner(other.shop)).send(body);
    expect((await asOtherStore('accept')).status).toBe(404);
    expect((await asOtherStore('refuse', { reason: 'teste' })).status).toBe(404);
    expect((await asOtherStore('receive', { ok: true })).status).toBe(404);
    expect((await ctx.http.get(`/v1/stores/${other.shop.store.id}/exchanges/${a.body.id}`).set(owner(other.shop))).status).toBe(404);
    expect((await ctx.http.get(`/v1/stores/${d.shop.store.id}/exchanges/${a.body.id}`).set(owner(other.shop))).status).toBe(404); // loja que não é dela
    const list = (await ctx.http.get(`/v1/stores/${other.shop.store.id}/exchanges`).set(owner(other.shop)).expect(200)).body.data as { id: string }[];
    expect(list.map((x) => x.id)).not.toContain(a.body.id);
    expect(((await ctx.http.get(`/v1/stores/${d.shop.store.id}/exchanges?scope=pending`).set(owner(d.shop)).expect(200)).body.data as { id: string }[]).map((x) => x.id)).toContain(a.body.id);
    expect((await ctx.http.get('/v1/exchanges').set(bearer(stranger.accessToken)).expect(200)).body.data).toEqual([]);
    expect((await ctx.http.get('/v1/exchanges').set(bearer(d.buyer.user.accessToken)).expect(200)).body.data).toHaveLength(1);
  });

  async function uploadPhoto(user: RegisteredUser): Promise<string> {
    const body = await jpegBuffer(400, 300);
    const created = await ctx.http.post('/v1/uploads').set(bearer(user.accessToken)).send({ purpose: 'exchange_photo', contentType: 'image/jpeg', sizeBytes: body.length }).expect(201);
    expect(memoryStorage(ctx).upload('private', created.body.upload.fields.key, body, 'image/jpeg')).toBe(204);
    const done = await ctx.http.post(`/v1/uploads/${created.body.id}/complete`).set(bearer(user.accessToken)).send({}).expect(200);
    expect(done.body).toMatchObject({ status: 'ready', contentType: 'image/webp', urls: null }); // privada e re-codificada
    return created.body.id as string;
  }

  it('fotos: do próprio cliente, privadas; foto de outra conta é 404; a loja do pedido lê por URL assinada', async () => {
    const d = await delivered();
    const mine = await uploadPhoto(d.buyer.user);
    const foreign = await uploadPhoto(await createCustomer(ctx));
    expect((await request(d, { orderItemId: d.itemA, type: 'defect', method: 'drop_at_store', photoIds: [foreign] })).status).toBe(404);
    const a = await request(d, { orderItemId: d.itemA, type: 'defect', method: 'drop_at_store', photoIds: [mine] }).expect(201);
    const view = (await ctx.http.get(`/v1/stores/${d.shop.store.id}/exchanges/${a.body.id}`).set(owner(d.shop)).expect(200)).body;
    expect(view.photos).toHaveLength(1);
    expect(view.photos[0].url).toEqual(expect.any(String));
    expect(view.storeCode).toBeNull();
  });

  it('relatório de trocas (WB-248): por loja e categoria, taxa com alerta, custos só para financeiro/super, CSV auditado; suporte não acessa', async () => {
    const d = await delivered();
    const a = await request(d, sizeRequest(d, { method: 'drop_at_store' })).expect(201);
    await store(d, a.body.id, 'accept').expect(200);
    const b = await request(d, { orderItemId: d.itemB, type: 'withdrawal', method: 'pickup_at_home' }).expect(201);
    expect(b.body.status).toBe('approved');
    const finance = await createAdmin(ctx, 'finance');
    const support = await createAdmin(ctx, 'support');
    const brt = (offsetDays: number) => new Date(Date.now() - 3 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10); // dia de Brasília
    const day = brt(0);
    const url = `/v1/admin/exchanges/report?from=${brt(-3)}&to=${day}&storeId=${d.shop.store.id}`;
    const fin = (await ctx.http.get(url).set(bearer(finance.accessToken)).expect(200)).body;
    expect(fin.totals).toMatchObject({ deliveredOrders: 1, exchanges: 2, byType: { withdrawal: 1, defect: 0, size_color: 1 }, sizeColorWithoutSizeChart: 1, feeRevenue: { amount: 0 }, logisticsCost: { amount: 0 } });
    expect(fin.byStore[0]).toMatchObject({ storeId: d.shop.store.id, exchanges: 2, ratePct: 200, alert: true });
    const operations = (await ctx.http.get(url).set(bearer(ops.accessToken)).expect(200)).body;
    expect(operations.totals.feeRevenue).toBeUndefined(); // custos só para financeiro e super admin
    expect(operations.totals.logisticsCost).toBeUndefined();
    expect((await ctx.http.get(url).set(bearer(support.accessToken))).status).toBe(403);
    expect((await ctx.http.get(url.replace(`to=${day}`, 'to=2000-01-01')).set(bearer(finance.accessToken))).status).toBe(400);
    const csv = await ctx.http.get(`${url}&format=csv`).set(bearer(finance.accessToken)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('loja_id;loja;pedidos_entregues');
    const empty = (await ctx.http.get('/v1/admin/exchanges/report?from=2001-01-01&to=2001-01-31').set(bearer(finance.accessToken)).expect(200)).body;
    expect(empty.totals).toMatchObject({ exchanges: 0, deliveredOrders: 0 });
  });

  it('avaliação com "como vestiu?": só de pedido entregue, no prazo, 1 por produto e 1 da loja; fit só em produto; dono apenas', async () => {
    const d = await delivered();
    const productA = (await ctx.db.select().from(productVariants).where(eq(productVariants.id, d.shop.variants[0]!)))[0]!.productId;
    const url = `/v1/orders/${d.orderId}/reviews`;
    const post = (body: Record<string, unknown>, user = d.buyer.user) => ctx.http.post(url).set(bearer(user.accessToken)).send(body);
    const res = await post({ productId: productA, rating: 4, comment: 'Ficou justa', fit: 'small' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ productId: productA, rating: 4, fit: 'small', verifiedPurchase: true });
    expect((await post({ productId: productA, rating: 5 })).body.code).toBe('REVIEW_ALREADY_EXISTS'); // sem edição
    expect((await post({ rating: 5, fit: 'ok' })).status).toBe(400); // fit só em produto
    expect((await post({ rating: 5, comment: 'Entrega rápida' })).status).toBe(201); // avaliação da loja
    expect((await post({ rating: 3 })).body.code).toBe('REVIEW_ALREADY_EXISTS');
    expect((await post({ productId: randomUUID(), rating: 5 })).status).toBe(404);
    expect((await post({ productId: productA, rating: 6 })).status).toBe(400);
    const stranger = await createCustomer(ctx);
    expect((await post({ rating: 5 }, stranger)).status).toBe(404);
    expect((await ctx.http.get(url).set(bearer(stranger.accessToken))).status).toBe(404);
    expect((await ctx.http.get(url).set(bearer(d.buyer.user.accessToken)).expect(200)).body.data).toHaveLength(2);
    // o "fit" aparece na leitura pública do produto
    const pub = (await ctx.http.get(`/v1/browse/products/${productA}/reviews`).expect(200)).body;
    expect(pub.data[0]).toMatchObject({ fit: 'small' });
    // pedido ainda não entregue e prazo vencido
    const late = await delivered({ deliveredAgoDays: 31 });
    expect((await ctx.http.post(`/v1/orders/${late.orderId}/reviews`).set(bearer(late.buyer.user.accessToken)).send({ rating: 5 })).body.code).toBe('REVIEW_WINDOW_CLOSED');
    const open = await delivered();
    await ctx.db.update(orders).set({ status: 'received' }).where(eq(orders.id, open.orderId));
    expect((await ctx.http.post(`/v1/orders/${open.orderId}/reviews`).set(bearer(open.buyer.user.accessToken)).send({ rating: 5 })).body.code).toBe('ORDER_NOT_DELIVERED');
  });

  /** Troca de tamanho/cor aprovada e com a taxa paga: a coleta entra na fila. Devolve o necessário para os testes de prazo. */
  async function paidPickup() {
    const d = await delivered();
    const id = (await request(d, sizeRequest(d)).then((r) => r.body)).id as string;
    await store(d, id, 'accept').expect(200);
    await ctx.http.post(`/v1/exchanges/${id}/payment`).set(bearer(d.buyer.user.accessToken)).send({ paymentMethod: 'pix' }).expect(200);
    await approve(ctx, d.buyer.user, (await exchangeAttempts(id))[0]!.id);
    const [run] = await runsOf(id);
    return { d, id, run: run! };
  }

  it('BUG-017 / WB-241 C7: coleta sem motoboy depois de `coleta_agendamento_dias_uteis` dias úteis fica "Atrasada" e alerta o admin uma vez', async () => {
    const { run } = await paidPickup();
    const listed = async () => ((await ctx.http.get(`${base}/deliveries`).query({ kind: 'exchange_pickup', limit: '100' }).set(bearer(ops.accessToken)).expect(200)).body.data as { id: string; overdue: boolean }[]).find((x) => x.id === run.id)!;
    expect(await listed()).toMatchObject({ overdue: false });
    await ctx.db.update(deliveries).set({ readyAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(deliveries.id, run.id)); // 8 dias corridos = pelo menos 5 úteis
    expect(await listed()).toMatchObject({ overdue: true });
    const { DeliveriesService } = await import('../src/modules/logistics/index.js');
    await ctx.app.get(DeliveriesService).alertLateDue();
    await ctx.app.get(DeliveriesService).alertLateDue();
    const alerts = (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'collection_late'))).filter((a) => (a.details as { deliveryId?: string }).deliveryId === run.id);
    expect(alerts).toHaveLength(1);
    // o prazo é parâmetro: com 10 dias úteis a mesma coleta deixa de estar atrasada
    await ctx.app.get(ParametersService).update('coleta_agendamento_dias_uteis', 10, 'teste', { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null });
    try {
      expect(await listed()).toMatchObject({ overdue: false });
    } finally {
      await ctx.app.get(ParametersService).update('coleta_agendamento_dias_uteis', 3, 'teste', { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null });
    }
  });

  it('BUG-017 / RN-11: troca com o item recebido sem desfecho depois de `reembolso_dias_uteis` dias úteis gera UM alerta ao financeiro', async () => {
    const { d, id, run } = await paidPickup();
    await courierWalk(run.id, 'delivered');
    await store(d, id, 'receive', { ok: true }).expect(200);
    expect((await exRow(id)).status).toBe('item_received');
    expect(await service().alertRefundLate()).toBeGreaterThanOrEqual(0);
    const mine = async () => (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'exchange_refund_late'))).filter((a) => (a.details as { exchangeId?: string }).exchangeId === id);
    expect(await mine()).toHaveLength(0); // acabou de receber: dentro do prazo
    await ctx.db.update(exchangeRequests).set({ receivedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(exchangeRequests.id, id));
    await service().alertRefundLate();
    await service().alertRefundLate();
    expect(await mine()).toHaveLength(1);
  });
});
