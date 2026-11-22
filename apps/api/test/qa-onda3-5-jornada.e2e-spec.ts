import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/index.js';
import { deliveries, exchangeRequests, orderItems, orders, paymentAttempts, paymentRefunds, productVariants } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { leaksCode } from './helpers/code-leak.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/**
 * QA Onda 3 a 5, jornada ponta a ponta contra a API real (Postgres e Redis reais; app Nest completo; provedor de pagamento `fake`
 * pelo mesmo caminho do webhook): comprar com PIX, a loja aceita, marca pronto, a operação atribui o motoboy e conclui com o
 * código do cliente, o cliente pede TROCA DE TAMANHO, a loja aprova, o cliente paga a taxa SÓ depois, a coleta, a conferência
 * da loja, a reentrega, e no fim o dinheiro fecha.
 */
describe('Jornada completa: PIX, aceite, pronto, motoboy, entrega, troca de tamanho, coleta, reentrega, ledger', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let finance: Awaited<ReturnType<typeof createAdmin>>;
  const base = '/v1/admin/logistics';

  // estado compartilhado entre os passos (a jornada é uma história só; um passo que falha derruba os seguintes de propósito)
  const j = {} as {
    shop: Awaited<ReturnType<typeof shopWith>>;
    buyer: Awaited<ReturnType<typeof customerAt>>;
    sizeM: { id: string };
    orderId: string;
    attemptId: string;
    totalCents: number;
    deliveryId: string;
    exchangeId: string;
    itemId: string;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ledger = ctx.app.get(LedgerService);
    ops = await createAdmin(ctx, 'operations');
    finance = await createAdmin(ctx, 'finance');
    j.shop = await shopWith(ctx, [{ name: 'Camiseta Polo', priceCents: 9_000, stock: 10 }], { voluntaryExchangeDays: 7 });
    j.buyer = await customerAt(ctx, j.shop.origin);
    const productId = (await ctx.db.select().from(productVariants).where(eq(productVariants.id, j.shop.variants[0]!)))[0]!.productId;
    const [m] = await ctx.db.insert(productVariants).values({ productId, storeId: j.shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
    j.sizeM = m!;
  });
  afterAll(() => ctx.close());

  const owner = () => bearer(j.shop.store.owner.accessToken);
  const customer = () => bearer(j.buyer.user.accessToken);
  const stock = async (id: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, id)))[0]!;
  const courierWalk = async (deliveryId: string, final: 'delivered') => {
    const c = (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: 'Carlos Moto Silva', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body as { id: string };
    await ctx.http.post(`${base}/deliveries/${deliveryId}/assign`).set(bearer(ops.accessToken)).send({ courierId: c.id }).expect(200);
    for (const action of ['confirm', 'picked_up']) await ctx.http.post(`${base}/deliveries/${deliveryId}/status`).set(bearer(ops.accessToken)).send({ action }).expect(200);
    const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, deliveryId)))[0]!.deliveryCode;
    await ctx.http.post(`${base}/deliveries/${deliveryId}/status`).set(bearer(ops.accessToken)).send(code ? { action: final, code } : { action: final }).expect(200);
  };

  it('J1 comprar com PIX: o pedido nasce aguardando pagamento, reserva o estoque e a cobrança sai igual ao total mostrado', async () => {
    await addToCart(ctx, j.buyer.user, j.shop.variants[0]!, 2).expect(200);
    const res = await placeOrder(ctx, j.buyer.user, j.buyer.addressId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    j.orderId = res.body.id as string;
    const row = await orderRow(ctx, j.orderId);
    expect(row.status).toBe('awaiting_payment');
    j.totalCents = row.totalCents;
    expect(row.totalCents).toBe(2 * 9_000 + 500); // 2 itens + taxa de entrega da tabela do admin (R$ 5,00 no ambiente de teste)
    expect(await stock(j.shop.variants[0]!)).toMatchObject({ stock: 10, reserved: 2 });
    const attempt = await attemptOf(ctx, j.orderId);
    j.attemptId = attempt.id;
    expect(attempt.amountCents).toBe(row.totalCents);
    expect(await ledger.hasSale(j.orderId)).toBe(false); // nada de dinheiro lançado antes do pagamento
  });

  it('J2 pagamento aprovado (webhook): RECEBIDO, baixa definitiva do estoque, ledger fecha, application_fee = comissão + entrega', async () => {
    await approve(ctx, j.buyer.user, j.attemptId);
    const row = await orderRow(ctx, j.orderId);
    expect(row.status).toBe('received');
    expect(await stock(j.shop.variants[0]!)).toMatchObject({ stock: 8, reserved: 0 });
    expect(row.applicationFeeCents).toBe(row.commissionCents + 500);
    const b = await ledger.balances(j.orderId);
    expect(b).toMatchObject({ paidCents: j.totalCents, deliveryFeeRevenue: 500, commissionRevenue: row.commissionCents });
    expect((await ledger.verifyOrder(j.orderId)).ok).toBe(true);
    // repetir a aprovação (webhook duplicado) não muda nada
    await approve(ctx, j.buyer.user, j.attemptId);
    expect(await ledger.balances(j.orderId)).toEqual(b);
  });

  it('J3 a loja aceita e marca "pronto para coleta"; a loja NÃO consegue marcar saiu nem entregue (RN-07/RN-18)', async () => {
    const url = `/v1/stores/${j.shop.store.id}/orders/${j.orderId}`;
    expect((await ctx.http.post(`${url}/accept`).set(owner()).expect(200)).body.status).toBe('accepted');
    expect((await ctx.http.post(`${url}/status`).set(owner()).send({ status: 'delivered' })).status).toBe(409);
    const ready = await ctx.http.post(`${url}/status`).set(owner()).send({ status: 'ready_for_collection', volumes: 1, note: 'tocar a campainha' });
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    const [d] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, j.orderId));
    expect(d).toMatchObject({ status: 'ready_for_collection', kind: 'delivery' });
    j.deliveryId = d!.id;
    expect((await orderRow(ctx, j.orderId)).status).toBe('ready_for_collection');
    // o cliente já enxerga a etapa
    const view = (await ctx.http.get(`/v1/orders/${j.orderId}`).set(customer()).expect(200)).body;
    expect(view.status).toBe('ready_for_collection');
  });

  it('J4 a operação atribui o motoboy, envia o WhatsApp sem dado proibido, e conclui a entrega SÓ com o código do cliente', async () => {
    const c = (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: 'João Moto Pereira', phone: '11 97777-1234', documentsChecked: true }).expect(201)).body as { id: string; phone: string };
    await ctx.http.post(`${base}/deliveries/${j.deliveryId}/assign`).set(bearer(ops.accessToken)).send({ courierId: c.id }).expect(200);
    const wa = (await ctx.http.get(`${base}/deliveries/${j.deliveryId}/whatsapp`).set(bearer(ops.accessToken)).expect(200)).body;
    const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, j.deliveryId)))[0]!.deliveryCode!;
    expect(wa.link).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(wa.message).toContain('Não cobrar');
    expect(wa.message).not.toMatch(/R\$|@|cpf/i); // sem valores, e-mail nem CPF
    expect(leaksCode(wa.message, code)).toBe(false); // o código de entrega é do cliente
    expect(wa.message).not.toContain('Camiseta'); // sem itens
    await ctx.http.post(`${base}/deliveries/${j.deliveryId}/whatsapp-sent`).set(bearer(ops.accessToken)).expect(204);
    await ctx.http.post(`${base}/deliveries/${j.deliveryId}/status`).set(bearer(ops.accessToken)).send({ action: 'confirm' }).expect(200);
    await ctx.http.post(`${base}/deliveries/${j.deliveryId}/status`).set(bearer(ops.accessToken)).send({ action: 'picked_up' }).expect(200);
    expect((await orderRow(ctx, j.orderId)).status).toBe('out_for_delivery');
    // o motoboy não leva o pacote sem o código: errado = 422 e o pedido NÃO conclui; sem código = erro
    const wrong = code === '0000' ? '1111' : '0000';
    expect((await ctx.http.post(`${base}/deliveries/${j.deliveryId}/status`).set(bearer(ops.accessToken)).send({ action: 'delivered', code: wrong })).status).toBe(422);
    expect((await ctx.http.post(`${base}/deliveries/${j.deliveryId}/status`).set(bearer(ops.accessToken)).send({ action: 'delivered' })).status).toBeGreaterThanOrEqual(400);
    expect((await orderRow(ctx, j.orderId)).status).toBe('out_for_delivery');
    await ctx.http.post(`${base}/deliveries/${j.deliveryId}/status`).set(bearer(ops.accessToken)).send({ action: 'delivered', code }).expect(200);
    const row = await orderRow(ctx, j.orderId);
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt).not.toBeNull();
    // concluir de novo não duplica efeito
    expect((await ctx.http.post(`${base}/deliveries/${j.deliveryId}/status`).set(bearer(ops.accessToken)).send({ action: 'delivered', code })).status).toBe(409);
  });

  it('J5 custo do motoboy: operação lança, o financeiro (outra pessoa) quita; o ledger registra despesa e o pagamento fora do app', async () => {
    await ctx.http.put(`${base}/deliveries/${j.deliveryId}/cost`).set(bearer(ops.accessToken)).send({ costCents: 700 }).expect(200);
    let b = await ledger.balances(j.orderId);
    expect(b).toMatchObject({ logisticsCostExpense: 700, courierPayable: 700, courierPaidCents: 0 });
    // segregação de funções (SEC-145): quem lançou não marca como pago; o financeiro marca
    expect((await ctx.http.post(`${base}/deliveries/payouts`).set(bearer(ops.accessToken)).send({ deliveryIds: [j.deliveryId], paidOn: '2026-11-20' })).status).toBe(403);
    await ctx.http.post(`${base}/deliveries/payouts`).set(bearer(finance.accessToken)).send({ deliveryIds: [j.deliveryId], paidOn: '2026-11-20' }).expect(200);
    b = await ledger.balances(j.orderId);
    expect(b).toMatchObject({ logisticsCostExpense: 700, courierPayable: 0, courierPaidCents: 700 });
    expect((await ledger.verifyOrder(j.orderId)).ok).toBe(true);
  });

  it('J6 o cliente pede TROCA DE TAMANHO: nada é cobrado ao pedir e a peça nova ainda não é reservada', async () => {
    const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, j.orderId));
    j.itemId = items[0]!.id;
    const opts = (await ctx.http.get(`/v1/orders/${j.orderId}/exchange-options`).set(customer()).expect(200)).body;
    const size = opts.items[0].options.find((o: { type: string }) => o.type === 'size_color');
    expect(size.eligible).toBe(true);
    const res = await ctx.http.post(`/v1/orders/${j.orderId}/exchanges`).set(customer()).set('Idempotency-Key', randomUUID()).send({ orderItemId: j.itemId, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: j.sizeM.id });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    j.exchangeId = res.body.id as string;
    expect(res.body).toMatchObject({ status: 'requested', fee: { amount: 0 }, totalDue: { amount: 0 } });
    expect(await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${j.exchangeId}`))).toHaveLength(0);
    expect((await stock(j.sizeM.id)).reserved).toBe(0);
    // 1 troca voluntária por pedido: a 2ª (mesmo pedido, outro tipo voluntário) é recusada
    const second = await ctx.http.post(`/v1/orders/${j.orderId}/exchanges`).set(customer()).set('Idempotency-Key', randomUUID()).send({ orderItemId: j.itemId, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: j.sizeM.id });
    expect(second.status).toBeGreaterThanOrEqual(409);
  });

  it('J7 a loja aprova: a taxa de troca da tabela do admin passa a ser devida (R$ 2,50), a reserva do tamanho M acontece e ainda não há corrida', async () => {
    const res = await ctx.http.post(`/v1/stores/${j.shop.store.id}/exchanges/${j.exchangeId}/accept`).set(owner()).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: 'awaiting_fee', fee: { amount: 250 }, totalDue: { amount: 250 } });
    expect((await stock(j.sizeM.id)).reserved).toBe(2); // a linha tem 2 unidades: reserva as 2 do tamanho novo
    expect(await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, j.exchangeId))).toHaveLength(0);
  });

  it('J8 a taxa é paga por PIX na conta da Webag (sem split): receita da Webag, idempotente; a corrida de coleta só nasce depois', async () => {
    const pay = await ctx.http.post(`/v1/exchanges/${j.exchangeId}/payment`).set(customer()).send({ paymentMethod: 'pix' });
    expect(pay.status, JSON.stringify(pay.body)).toBe(200);
    await ctx.http.post(`/v1/exchanges/${j.exchangeId}/payment`).set(customer()).send({ paymentMethod: 'pix' }).expect(200); // toque duplo
    const attempts = await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, `exchange:${j.exchangeId}`));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ amountCents: 250, storeId: null, applicationFeeCents: 0 });
    await approve(ctx, j.buyer.user, attempts[0]!.id);
    await approve(ctx, j.buyer.user, attempts[0]!.id); // webhook repetido
    expect((await ctx.http.get(`/v1/exchanges/${j.exchangeId}`).set(customer()).expect(200)).body).toMatchObject({ status: 'approved', feePaid: true });
    const runs = await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, j.exchangeId));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ kind: 'exchange_pickup', status: 'ready_for_collection' });
    const b = await ledger.balances(j.orderId);
    expect(b.exchangeFeeRevenue).toBe(250);
    expect(b.exchangeReceivedCents).toBe(250);
  });

  it('J9 coleta pela logística; a LOJA confere o item (não o motoboy); só então nasce a reentrega; a peça nova sai e a troca conclui', async () => {
    const [pickup] = await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, j.exchangeId));
    expect((await ctx.http.post(`/v1/stores/${j.shop.store.id}/exchanges/${j.exchangeId}/receive`).set(owner()).send({ ok: true })).status).toBe(409); // ainda não coletado
    await courierWalk(pickup!.id, 'delivered');
    expect((await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, j.exchangeId)))[0]!.status).not.toBe('completed'); // motoboy sozinho não conclui
    expect(await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, j.exchangeId))).toHaveLength(1); // sem reentrega antes da conferência
    const received = await ctx.http.post(`/v1/stores/${j.shop.store.id}/exchanges/${j.exchangeId}/receive`).set(owner()).send({ ok: true }).expect(200);
    expect(received.body.status).toBe('item_received');
    const runs = await ctx.db.select().from(deliveries).where(eq(deliveries.exchangeId, j.exchangeId));
    expect(runs.map((r) => r.kind).sort()).toEqual(['exchange_pickup', 'exchange_return']);
    expect((await stock(j.sizeM.id)).stock).toBe(5); // a peça nova ainda não saiu
    await courierWalk(runs.find((r) => r.kind === 'exchange_return')!.id, 'delivered');
    expect((await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, j.exchangeId)))[0]!.status).toBe('completed');
    expect(await stock(j.sizeM.id)).toMatchObject({ stock: 3, reserved: 0 }); // baixa definitiva do M (2 unidades)
    expect((await stock(j.shop.variants[0]!)).stock).toBe(10); // as 2 peças devolvidas voltaram ao estoque (8 + 2)
  });

  it('J10 o dinheiro fecha: ledger do pedido ok, nada foi estornado, a troca não gerou comissão nova, só a taxa de R$ 2,50 de receita extra', async () => {
    expect((await ledger.verifyOrder(j.orderId)).ok).toBe(true);
    const b = await ledger.balances(j.orderId);
    const row = await orderRow(ctx, j.orderId);
    expect(b).toMatchObject({ paidCents: j.totalCents, refundedCents: 0, commissionRevenue: row.commissionCents, deliveryFeeRevenue: 500, exchangeFeeRevenue: 250, logisticsCostExpense: 700 });
    expect(await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, j.attemptId))).toHaveLength(0);
    const [dr] = (await ctx.db.execute(sql`select coalesce(sum(case direction when 'debit' then amount_cents else -amount_cents end),0)::bigint as diff from ledger_entries e join ledger_transactions t on t.id = e.transaction_id where t.order_id = ${j.orderId}`)).rows as { diff: string }[];
    expect(Number(dr!.diff)).toBe(0);
    // custo da logística da troca ainda não lançado: nenhuma corrida de troca tem custo (relatório de custo da Webag é do financeiro)
    const [o] = await ctx.db.select({ s: orders.status }).from(orders).where(eq(orders.id, j.orderId));
    expect(o!.s).toBe('delivered'); // a troca não reabre o pedido
  });
});
