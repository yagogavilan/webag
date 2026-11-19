import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { OrdersService } from '../src/modules/orders/index.js';
import { deliveries, orders, paymentRefunds } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/**
 * QA Onda 3 a 5: lacunas confirmadas contra a API real. Cada teste descreve o comportamento ESPECIFICADO (PRD, RN, SEC) e está
 * marcado com `it.fails` enquanto o bug estiver aberto: a suíte continua verde, e quando o desenvolvedor corrigir o bug o teste
 * passa a "falhar por passar" (vitest avisa), e basta trocar `it.fails` por `it`. Os IDs apontam para docs/qa/bugs/BUG-###.md.
 */
describe('Lacunas confirmadas (comportamento especificado ainda não entregue)', () => {
  let ctx: TestContext;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;
  let ops: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    superAdmin = await createAdmin(ctx, 'super_admin');
    ops = await createAdmin(ctx, 'operations');
  });
  afterAll(() => ctx.close());

  async function paidOrder(mode: 'delivery' | 'pickup' = 'delivery') {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 10 }], mode === 'pickup' ? { pickupEnabled: true } : {});
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const res = await placeOrder(ctx, buyer.user, buyer.addressId, mode === 'pickup' ? { mode: 'pickup', addressId: undefined, expectedTotalCents: 5_000 } : {});
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const orderId = res.body.id as string;
    const attempt = await attemptOf(ctx, orderId);
    await approve(ctx, buyer.user, attempt.id);
    return { shop, buyer, orderId, attempt, url: `/v1/stores/${shop.store.id}/orders/${orderId}` };
  }
  const refundTotal = async (attemptId: string) => (await ctx.db.select().from(paymentRefunds).where(eq(paymentRefunds.attemptId, attemptId))).reduce((s, r) => s + r.amountCents, 0);

  it('BUG-011 (RN-08, WB-109, SEC-151): o admin estorna o pedido TODO e o pedido deixa de estar ativo (a loja não aceita nem a logística despacha pedido já devolvido)', async () => {
    const o = await paidOrder();
    const r = await ctx.http.post(`/v1/admin/orders/${o.orderId}/refunds`).set(bearer(superAdmin.accessToken)).set('Idempotency-Key', randomUUID()).send({ amountCents: o.attempt.amountCents, reason: 'estorno total para teste de QA' });
    expect(r.status).toBe(200);
    expect(await refundTotal(o.attempt.id)).toBe(o.attempt.amountCents);
    expect((await orderRow(ctx, o.orderId)).status).toBe('cancelled'); // obtido: 'received'
    expect((await ctx.http.post(`${o.url}/accept`).set(bearer(o.shop.store.owner.accessToken)).send({})).status).toBeGreaterThanOrEqual(409); // obtido: 200
  });

  it('BUG-011b (RN-08 "Qualquer estado | admin | cancelar e estornar"): existe rota do admin para cancelar o pedido com motivo e estorno', async () => {
    const o = await paidOrder();
    const res = await ctx.http.post(`/v1/admin/orders/${o.orderId}/cancel`).set(bearer(superAdmin.accessToken)).send({ reason: 'cancelamento pelo admin, teste de QA' }); // obtido: 404 (rota não existe)
    expect(res.status).toBe(200);
  });

  it.fails('BUG-012 (WB-233 C6): cancelar a corrida (pedido cancelado, loja desistiu) leva o motivo ao pedido: o pedido não fica em "pronto para coleta" sem corrida', async () => {
    const o = await paidOrder();
    await ctx.http.post(`${o.url}/accept`).set(bearer(o.shop.store.owner.accessToken)).send({}).expect(200);
    await ctx.http.post(`${o.url}/status`).set(bearer(o.shop.store.owner.accessToken)).send({ status: 'ready_for_collection' }).expect(200);
    const [d] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, o.orderId));
    await ctx.http.post(`/v1/admin/logistics/deliveries/${d!.id}/status`).set(bearer(ops.accessToken)).send({ action: 'cancel', reason: 'pedido cancelado, teste de QA' }).expect(200);
    expect((await orderRow(ctx, o.orderId)).status).not.toBe('ready_for_collection'); // obtido: 'ready_for_collection', sem corrida e sem estorno
  });

  it('BUG-013 (SEC-148): a mesma revisão da sacola criada ao MESMO TEMPO com chaves de idempotência diferentes gera um único pedido', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const results = await Promise.all([placeOrder(ctx, buyer.user, buyer.addressId, {}, randomUUID()), placeOrder(ctx, buyer.user, buyer.addressId, {}, randomUUID())]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1); // obtido: 2 pedidos (2 reservas e, no cartão, 2 cobranças). Em sequência a 2ª já é recusada (sacola esvaziada)
  });

  it.fails('BUG-014 (WB-026 C3, RN-07): retirada não feita em retirada_prazo_horas (48 h) é cancelada pelo sistema com estorno total', async () => {
    const o = await paidOrder('pickup');
    await ctx.http.post(`${o.url}/accept`).set(bearer(o.shop.store.owner.accessToken)).send({}).expect(200);
    await ctx.http.post(`${o.url}/status`).set(bearer(o.shop.store.owner.accessToken)).send({ status: 'ready_for_pickup' }).expect(200);
    await ctx.app.get(OrdersService).sweep(new Date(Date.now() + 49 * 3_600_000));
    expect((await orderRow(ctx, o.orderId)).status).toBe('cancelled'); // obtido: continua 'ready_for_pickup' para sempre, estoque baixado, dinheiro sem desfecho
    expect(await refundTotal(o.attempt.id)).toBe(o.attempt.amountCents);
  });

  it('BUG-015 (WB-037): "Não recebi meu pedido" tem operação no contrato (B.1, entregue em 2026-11-19)', () => {
    const yaml = readFileSync(new URL('../../../docs/arquitetura/api/openapi.yaml', import.meta.url), 'utf8');
    const paths = yaml.split('\n').filter((l) => /^ {2}\/v1\//.test(l));
    expect(paths.some((p) => /not-received/.test(p))).toBe(true);
  });

  it.fails('BUG-015 (WB-028 C2): "Pedir cancelamento" (request_cancel, pedido em preparo) tem operação no contrato', () => {
    const yaml = readFileSync(new URL('../../../docs/arquitetura/api/openapi.yaml', import.meta.url), 'utf8');
    const paths = yaml.split('\n').filter((l) => /^ {2}\/v1\//.test(l));
    expect(paths.some((p) => /request-cancel|cancel-request/.test(p))).toBe(true); // obtido: nenhuma
  });

  it.fails('BUG-016 (WB-230 C6, RN-18, DEC-039c): horário da logística e "pausar entregas" existem como parâmetro/rota do admin', async () => {
    const res = await ctx.http.get('/v1/admin/parameters').set(bearer(superAdmin.accessToken)).expect(200);
    const keys = JSON.stringify(res.body);
    expect(keys).toContain('logistica_horario'); // obtido: parâmetro inexistente; checkout oferece entrega 24 h e não há como pausar
    void orders;
  });

  it.fails('BUG-018 (WB-012 C3, RN-03): "Mais vendidos" aparece na home com 5+ pedidos pagos nos últimos 30 dias na região', async () => {
    const shop = await shopWith(ctx, [{ name: 'Campeão de Vendas', priceCents: 3_000, stock: 50 }]);
    for (let i = 0; i < 5; i++) {
      const buyer = await customerAt(ctx, shop.origin);
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const res = await placeOrder(ctx, buyer.user, buyer.addressId);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      await approve(ctx, buyer.user, (await attemptOf(ctx, res.body.id as string)).id);
    }
    await ctx.redis.flushdb();
    const home = (await ctx.http.get(`/v1/home?lat=${shop.origin.lat}&lng=${shop.origin.lng}`).expect(200)).body as { bestSellers: { name: string }[] };
    expect(home.bestSellers.map((p) => p.name)).toContain('Campeão de Vendas'); // obtido: [] sempre (discovery.service.ts: "até lá a seção vem vazia")
  });
});
