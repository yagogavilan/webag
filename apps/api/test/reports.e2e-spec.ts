import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { orders } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs, registerUser, verifyEmailOf } from './helpers/fixtures.js';
import { isolatedPoint, makeStore, northOf } from './helpers/discovery.js';
import { addToCart, approve, attemptOf, placeOrder } from './helpers/orders.js';
import { variantOf } from './helpers/discovery.js';

const DAY = 86_400_000;

describe('Relatórios operacionais do admin (WB-122, RN-15, O6.4)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let finance: Awaited<ReturnType<typeof createAdmin>>;
  let support: Awaited<ReturnType<typeof createAdmin>>;
  let storeId: string;
  let cityId: string;
  let ownerToken: string;
  const ids: Record<string, string> = {};
  const day = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
  const from = day(Date.now() - 60 * DAY);
  const to = day(Date.now());

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    ops = await createAdmin(ctx, 'operations');
    finance = await createAdmin(ctx, 'finance');
    support = await createAdmin(ctx, 'support');
    const cityName = `Cidade Rel ${randomUUID().slice(0, 6)}`;
    cityId = (await ensureCity(ctx, cityName)).id;
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Relatórios', at: await northOf(ctx, origin, 800), cityName, feeFixedCents: 500, approvedDaysAgo: 5, products: [{ name: 'Item R', priceCents: 10_000, stock: 100 }] });
    storeId = store.id;
    ownerToken = store.owner.accessToken;
    const variant = await variantOf(ctx, store.productIds[0]!);
    // Dois clientes COM endereço na cidade do teste (novos clientes por cidade).
    const mk = async () => {
      const u = await registerUser(ctx);
      await verifyEmailOf(ctx, u);
      const addr = await ctx.http.post('/v1/me/addresses').set(bearer(u.accessToken)).send({ cep: '07900-100', street: 'Rua Rel', number: '1', neighborhood: 'Centro', city: cityName, state: 'SP', lat: origin.lat, lng: origin.lng }).expect(201);
      return { u, addressId: addr.body.id as string };
    };
    const a = await mk();
    const b = await mk();
    const place = async (who: { u: Awaited<ReturnType<typeof registerUser>>; addressId: string }, qty: number, paid = true) => {
      await addToCart(ctx, who.u, variant, qty).expect(200);
      const created = (await placeOrder(ctx, who.u, who.addressId)).body as { id: string };
      if (paid) await approve(ctx, who.u, (await attemptOf(ctx, created.id)).id);
      return created.id;
    };
    // A: 2 entregues (40 e 35 dias atrás); B: 1 entregue (45 dias atrás), 1 cancelado pelo cliente, 1 recusado pela loja; 1 sem pagar.
    ids.a1 = await place(a, 1);
    ids.a2 = await place(a, 2);
    ids.b1 = await place(b, 1);
    ids.bCancel = await place(b, 1);
    ids.bRefuse = await place(b, 1);
    ids.unpaid = await place(b, 1, false);
    const deliver = async (id: string, daysAgo: number) =>
      ctx.db.update(orders).set({ status: 'delivered', paidAt: new Date(Date.now() - daysAgo * DAY), deliveredAt: new Date(Date.now() - daysAgo * DAY + 3_600_000) }).where(eq(orders.id, id));
    await deliver(ids.a1, 40);
    await deliver(ids.a2, 35);
    await deliver(ids.b1, 45);
    await ctx.http.post(`/v1/orders/${ids.bCancel}/cancel`).set(bearer(b.u.accessToken)).send({ reason: 'Desisti da compra' }).expect(200);
    await ctx.http.post(`/v1/stores/${storeId}/orders/${ids.bRefuse}/refuse`).set(bearer(ownerToken)).send({ reason: 'Produto acabou na loja' }).expect(200);
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 20 * DAY) }).where(eq(orders.id, ids.bCancel));
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 10 * DAY) }).where(eq(orders.id, ids.bRefuse));
  }, 120_000);
  afterAll(() => ctx.close());

  const get = (path: string, token = ops.accessToken) => ctx.http.get(`/v1/admin/reports/${path}`).set(bearer(token));
  const q = (extra = '') => `from=${from}&to=${to}&storeId=${storeId}${extra}`;
  const rows = async () => (await ctx.db.select().from(orders).where(eq(orders.storeId, storeId))).filter((o) => o.paidAt !== null);

  it('permissões: super admin, operação e financeiro leem; suporte e sem login não', async () => {
    await get(`operations?${q()}`, support.accessToken).expect(403);
    await ctx.http.get(`/v1/admin/reports/operations?${q()}`).expect(401);
    await get(`operations?${q()}`, finance.accessToken).expect(200);
    await get(`operations?${q()}`, ops.accessToken).expect(200);
    await get(`orders?${q()}`, support.accessToken).expect(403);
  });

  it('KPIs da RN-15: pedidos que chegaram a RECEBIDO, GMV sem cancelados/recusados, ticket, cancelamento por ator e motivo, recompra', async () => {
    const r = (await get(`operations?${q()}`).expect(200)).body;
    const all = await rows();
    const delivered = all.filter((o) => o.status === 'delivered');
    const gmvDone = delivered.reduce((a, o) => a + o.totalCents, 0);
    expect(all).toHaveLength(5); // o pedido sem pagamento não conta
    expect(r.kpis.orders).toBe(5);
    expect(r.kpis.gmv.amount).toBe(gmvDone); // cancelado e recusado ficam fora
    expect(r.kpis.gmvDelivered.amount).toBe(gmvDone);
    expect(r.kpis.deliveredOrders).toBe(3);
    expect(r.kpis.averageTicket.amount).toBe(Math.round(gmvDone / 3));
    expect(r.kpis).toMatchObject({ cancelledOrders: 2, cancellationRatePct: 40 });
    expect(r.cancellations).toEqual(expect.arrayContaining([
      { actor: 'customer', reason: 'Desisti da compra', orders: 1, value: { amount: expect.any(Number), currency: 'BRL' } },
      { actor: 'store', reason: 'Produto acabou na loja', orders: 1, value: { amount: expect.any(Number), currency: 'BRL' } },
    ]));
    // Recompra: coorte = clientes cujo 1º pedido entregue caiu no período e já tem 30 dias (A e B); só A voltou em 30 dias.
    expect(r.kpis.repurchase).toEqual({ cohort: 2, repurchased: 1, ratePct: 50 });
    expect(r.timezone).toBe('America/Sao_Paulo');
    expect(r.empty).toBe(false);
  });

  it('novas lojas e novos clientes seguem o filtro de cidade; a série tem um ponto por dia e fecha com o total', async () => {
    const r = (await get(`operations?from=${from}&to=${to}&cityId=${cityId}`).expect(200)).body;
    expect(r.kpis.newStores).toBe(1);
    expect(r.kpis.newCustomers).toBe(2);
    expect(r.kpis.orders).toBe(5);
    const series = (await get(`operations?${q()}`).expect(200)).body.series as { date: string; orders: number; gmv: { amount: number } }[];
    expect(series).toHaveLength(61);
    expect(series.reduce((a, p) => a + p.orders, 0)).toBe(5);
    expect(series.find((p) => p.date === day(Date.now() - 40 * DAY))!.orders).toBe(1);
  });

  it('batem com a lista de pedidos (C4) e com o LEDGER: comissão, taxa de serviço e entrega dos relatórios = ledger = soma dos pedidos', async () => {
    const r = (await get(`operations?${q()}`).expect(200)).body;
    const list: { total: { amount: number }; status: string }[] = [];
    let cursor: string | null = null;
    do {
      const page = (await get(`orders?${q()}&limit=2${cursor ? `&cursor=${cursor}` : ''}`).expect(200)).body as { data: typeof list; nextCursor: string | null };
      list.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    expect(list).toHaveLength(r.kpis.orders);
    expect(list.filter((o) => !['cancelled', 'refused'].includes(o.status)).reduce((a, o) => a + o.total.amount, 0)).toBe(r.kpis.gmv.amount);
    expect((await get(`orders?${q('&status=refused')}`).expect(200)).body.data).toHaveLength(1);

    // Ledger x pedidos: o que o relatório calcula pelo snapshot dos pedidos é o que o ledger (vendas menos devoluções) registrou.
    expect(r.revenue.ledger.commission).toEqual(r.revenue.orders.commission);
    expect(r.revenue.ledger.serviceFee).toEqual(r.revenue.orders.serviceFee);
    expect(r.revenue.ledger.deliveryFee).toEqual(r.revenue.orders.deliveryFee);
    expect(r.revenue.orders.commission.amount).toBeGreaterThan(0);
    expect(r.revenue.orders.deliveryFee.amount).toBeGreaterThan(0);
    // application_fee = comissão + entrega + serviço - desconto da plataforma (DEC-036).
    const o = r.revenue.orders;
    expect(o.applicationFee.amount).toBe(o.commission.amount + o.deliveryFee.amount + o.serviceFee.amount - o.platformDiscount.amount);
  });

  it('variação contra o período anterior de mesma duração; período sem dados vem vazio (C3); validações', async () => {
    const recent = (await get(`operations?from=${day(Date.now() - 12 * DAY)}&to=${to}&storeId=${storeId}`).expect(200)).body;
    expect(recent.kpis.orders).toBe(1); // só o recusado (10 dias atrás)
    expect(recent.variation.ordersPct).not.toBeUndefined();
    const before = (await get(`operations?from=${day(Date.now() - 24 * DAY)}&to=${day(Date.now() - 13 * DAY)}&storeId=${storeId}`).expect(200)).body;
    expect(before.kpis.orders).toBe(1); // o cancelado (20 dias atrás)
    expect(recent.variation.ordersPct).toBe(0); // 1 contra 1
    const empty = (await get(`operations?from=2020-01-01&to=2020-01-31&storeId=${storeId}`).expect(200)).body;
    expect(empty).toMatchObject({ empty: true, kpis: { orders: 0, cancellationRatePct: 0, repurchase: { cohort: 0, ratePct: null } }, variation: { ordersPct: null } });
    await get(`operations?from=${to}&to=${from}`).expect(400);
    await get('operations?from=2020-01-01&to=2022-01-01').expect(400);
    await get(`operations?${q('&storeId=nao-uuid')}`).expect(400);
    await get(`operations?${q('&extra=1')}`).expect(400);
  });

  it('CSV com os mesmos números e auditado; fórmula de planilha é neutralizada', async () => {
    const csv = await get(`orders.csv?${q()}`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('pedido;loja;status;modo;pago_em;entregue_em;subtotal;taxa_entrega;taxa_servico;desconto;total;comissao;cancelado_por;motivo');
    expect(lines).toHaveLength(1 + 5);
    const r = (await get(`operations?${q()}`).expect(200)).body;
    const totals = lines.slice(1).map((l) => l.split(';')).filter((c) => !['cancelled', 'refused'].includes(c[2]!)).reduce((a, c) => a + Math.round(Number(c[10]!.replace(',', '.')) * 100), 0);
    expect(totals).toBe(r.kpis.gmv.amount);
    const kpiCsv = await get(`operations.csv?${q()}`).expect(200);
    expect(kpiCsv.text).toContain('pedidos;5');
    expect(kpiCsv.text).toContain('taxa_cancelamento_pct;40');
    await get(`operations.csv?${q()}`, support.accessToken).expect(403);

    const audit = (await ctx.http.get('/v1/admin/audit-log?action=report.export').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body.data as { targetId: string }[];
    expect(audit.map((a) => a.targetId)).toEqual(expect.arrayContaining(['orders', 'operations']));
    // Nome de loja com fórmula não vira fórmula na planilha.
    await ctx.db.execute(sql`update stores set name = '=HYPERLINK("x")' where id = ${storeId}::uuid`);
    expect((await get(`orders.csv?${q()}`).expect(200)).text).toContain("'=HYPERLINK");
  });
});
