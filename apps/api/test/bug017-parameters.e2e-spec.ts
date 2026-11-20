import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { MIN_ORDERS_FOR_CANCEL_ALERT, OrderEventBus, OrdersService, type OrderEvent } from '../src/modules/orders/index.js';
import { orders, paymentAlerts } from '../src/platform/database/schema.js';
import { generateOrderNumber } from '../src/modules/orders/order-number.js';
import { ParametersService } from '../src/modules/admin/index.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { restoreFees, useParam } from './helpers/fees.js';
import { ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, cartView, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** BUG-017: parâmetros do admin (RN-02) que não tinham efeito. Os de troca/logística estão em `exchanges.e2e-spec`. */
describe('Parâmetros do admin ligados ao comportamento (BUG-017)', () => {
  let ctx: TestContext;
  let events: OrderEvent[];
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    await restoreFees(ctx);
    events = [];
    ctx.app.get(OrderEventBus).subscribe((e) => void events.push(e));
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await useParam(ctx, 'codigo_retirada_digitos', 4);
    await useParam(ctx, 'loja_aceite_lembrete_min', 5);
    await useParam(ctx, 'cancelamento_loja_alerta_pct', 10);
    await ctx.close();
  });

  async function paidOrder(mode: 'delivery' | 'pickup' = 'delivery') {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 50 }], { pickupEnabled: true });
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created =
      mode === 'delivery'
        ? await placeOrder(ctx, buyer.user, buyer.addressId)
        : await (async () => {
            const { revision, totalCents } = await cartView(ctx, buyer.user, undefined);
            return ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'pickup', cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix' });
          })();
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.body.id as string)).id);
    return { shop, buyer, id: created.body.id as string };
  }

  it('codigo_retirada_digitos: o código de retirada nasce com a quantidade configurada e a loja conclui com ele', async () => {
    await useParam(ctx, 'codigo_retirada_digitos', 6);
    const r = await paidOrder('pickup');
    const code = (await orderRow(ctx, r.id)).pickupCode!;
    expect(code).toMatch(/^\d{6}$/);
    expect((await ctx.http.get(`/v1/orders/${r.id}`).set(bearer(r.buyer.user.accessToken)).expect(200)).body.pickup.code).toBe(code);
    const url = `/v1/stores/${r.shop.store.id}/orders/${r.id}`;
    await ctx.http.post(`${url}/accept`).set(bearer(r.shop.store.owner.accessToken)).expect(200);
    await ctx.http.post(`${url}/status`).set(bearer(r.shop.store.owner.accessToken)).send({ status: 'ready_for_pickup' }).expect(200);
    const done = await ctx.http.post(`${url}/status`).set(bearer(r.shop.store.owner.accessToken)).send({ status: 'delivered', pickupCode: code });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    await useParam(ctx, 'codigo_retirada_digitos', 4);
    expect((await orderRow(ctx, (await paidOrder('pickup')).id)).pickupCode).toMatch(/^\d{4}$/);
  });

  it('loja_aceite_lembrete_min: a loja recebe UM lembrete depois do prazo; antes dele e depois de aceitar, não', async () => {
    const r = await paidOrder();
    const mine = () => events.filter((e) => e.orderId === r.id && e.notice === 'accept_reminder');
    const svc = ctx.app.get(OrdersService);
    await svc.sweep(new Date());
    expect(mine()).toHaveLength(0); // pago agora: ainda dentro dos 5 min
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 6 * 60_000) }).where(eq(orders.id, r.id));
    await svc.sweep(new Date());
    await svc.sweep(new Date());
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toMatchObject({ storeId: r.shop.store.id, to: 'received' });
    // o prazo é parâmetro: com 8 min o mesmo pedido (6 min) ainda não receberia
    const other = await paidOrder();
    await useParam(ctx, 'loja_aceite_lembrete_min', 8);
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 6 * 60_000) }).where(eq(orders.id, other.id));
    await svc.sweep(new Date());
    expect(events.filter((e) => e.orderId === other.id && e.notice === 'accept_reminder')).toHaveLength(0);
    await useParam(ctx, 'loja_aceite_lembrete_min', 5);
  });

  it('A-08: lembrete de aceite precisa sair >= 2 min antes do prazo (validação cruzada nos dois sentidos); 422 e valor inalterado', async () => {
    const ctxSys = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
    const params = ctx.app.get(ParametersService);
    for (const [key, value] of [['loja_aceite_lembrete_min', 9], ['loja_aceite_lembrete_min', 10], ['loja_aceite_timeout_min', 6]] as const) {
      await expect(params.update(key, value, 'teste A-08', ctxSys)).rejects.toMatchObject({ code: 'PARAMETER_OUT_OF_RANGE', status: 422 });
    }
    expect(await params.getNumber('loja_aceite_lembrete_min')).toBe(5);
    expect(await params.getNumber('loja_aceite_timeout_min')).toBe(10);
    await useParam(ctx, 'loja_aceite_lembrete_min', 8); // exatamente timeout - 2 passa
    await useParam(ctx, 'loja_aceite_lembrete_min', 5);
  });

  it('cancelamento_loja_alerta_pct: loja com cancelamento por culpa dela acima do limite (com amostra mínima) gera alerta; o cliente que cancela não conta', async () => {
    const base = await paidOrder();
    const row = await orderRow(ctx, base.id);
    const clone = async (over: Partial<typeof orders.$inferInsert>) => {
      await ctx.db.insert(orders).values({ ...row, id: randomUUID(), number: generateOrderNumber(), paymentAttemptId: null, ...over } as typeof orders.$inferInsert);
    };
    const svc = ctx.app.get(OrdersService);
    const alerts = async () => (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'store_cancel_rate'))).filter((a) => (a.details as { storeId?: string }).storeId === row.storeId);
    // 9 pedidos pagos no total: abaixo da amostra mínima, mesmo com cancelamento da loja
    for (let i = 0; i < MIN_ORDERS_FOR_CANCEL_ALERT - 2; i += 1) await clone({ status: 'delivered', deliveredAt: new Date() });
    await clone({ status: 'cancelled', cancelledBy: 'store', cancelledAt: new Date(), cancelReason: 'sem estoque' });
    await clone({ status: 'cancelled', cancelledBy: 'customer', cancelledAt: new Date(), cancelReason: 'desisti' });
    await svc.alertStoreCancelRate(new Date(), true);
    expect(await alerts()).toHaveLength(0); // 11 pedidos, 1 da loja = 9,1% <= 10%
    await clone({ status: 'refused', cancelledBy: 'store', cancelledAt: new Date() });
    await svc.alertStoreCancelRate(new Date(), true);
    expect(await alerts()).toHaveLength(1); // 2 de 12 = 16,7% > 10%
    await svc.alertStoreCancelRate(new Date(), true);
    expect(await alerts()).toHaveLength(1); // sem alerta duplicado
  });

  it('BUG-014: o cliente é avisado UMA vez 24 h antes de a retirada vencer, com o prazo final; depois de retirar, não', async () => {
    const r = await paidOrder('pickup');
    const url = `/v1/stores/${r.shop.store.id}/orders/${r.id}`;
    await ctx.http.post(`${url}/accept`).set(bearer(r.shop.store.owner.accessToken)).expect(200);
    await ctx.http.post(`${url}/status`).set(bearer(r.shop.store.owner.accessToken)).send({ status: 'ready_for_pickup' }).expect(200);
    const svc = ctx.app.get(OrdersService);
    const mine = () => events.filter((e) => e.orderId === r.id && e.notice === 'pickup_reminder');
    await svc.remindPickups(new Date(Date.now() + 10 * 3_600_000)); // 10 h depois: faltam 38 h
    expect(mine()).toHaveLength(0);
    const at = new Date(Date.now() + 25 * 3_600_000); // 25 h depois: faltam 23 h
    await svc.remindPickups(at);
    await svc.remindPickups(at);
    expect(mine()).toHaveLength(1);
    const until = mine()[0]!.pickupUntil!;
    expect(Math.round((until.getTime() - Date.now()) / 3_600_000)).toBe(48);
    expect((await orderRow(ctx, r.id)).pickupRemindedAt).not.toBeNull();
    // depois de vencido, quem cuida é o cancelamento, não o lembrete
    await svc.sweep(new Date(Date.now() + 49 * 3_600_000));
    expect((await orderRow(ctx, r.id)).status).toBe('cancelled');
  });
});
