import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DeliveriesService } from '../src/modules/logistics/index.js';
import { auditLog, deliveries } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';

type Admin = Awaited<ReturnType<typeof createAdmin>>;

/** WB-240: relatórios de logística com números conferidos à mão (margem, subsídio do frete grátis, a pagar por motoboy). */
describe('Relatórios de logística (WB-240)', () => {
  let ctx: TestContext;
  let svc: DeliveriesService;
  let ops: Admin, finance: Admin, support: Admin;
  const sys = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
  const base = '/v1/admin/logistics';
  const storeId = randomUUID();
  const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10); // dia civil de Brasília
  let cityX: { id: string }, cityY: { id: string };
  let courier1: string, courier2: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    svc = ctx.app.get(DeliveriesService);
    [ops, finance, support] = [await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'support')];
    cityX = await ensureCity(ctx, 'Francisco Morato');
    cityY = await ensureCity(ctx, 'Caieiras');
    const courier = async () => (await ctx.http.post(`${base}/couriers`).set(bearer(ops.accessToken)).send({ name: `Moto ${randomUUID().slice(0, 4)}`, phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true }).expect(201)).body.id as string;
    [courier1, courier2] = [await courier(), await courier()];

    const make = async (name: string, over: { cityId: string; feeCents: number; courierId: string; end: 'delivered' | 'not_delivered' | 'cancelled'; costCents?: number }) => {
      const { delivery } = await ctx.db.transaction((tx) =>
        svc.createInTx(tx, { orderId: randomUUID(), storeId, cityId: over.cityId, feeCents: over.feeCents, expectedCostCents: 900, volumes: 1, contact: { number: 'WB-AAAAA', kind: 'delivery', storeName: 'Loja', storePhone: null, pickupAddress: 'Rua A, 1, Centro, Francisco Morato', dropoffAddress: 'Rua B, 2, Centro, Francisco Morato', customerFirstName: 'Ana', customerPhone: '11 97777-0000', volumes: 1, note: null } }, sys),
      );
      ids[name] = delivery.id;
      await ctx.db.update(deliveries).set({ readyAt: new Date(Date.now() - 30 * 60_000) }).where(eq(deliveries.id, delivery.id)); // pronta há 30 min: os tempos médios ficam perto disso
      await ctx.http.post(`${base}/deliveries/${delivery.id}/assign`).set(bearer(ops.accessToken)).send({ courierId: over.courierId }).expect(200);
      if (over.end === 'cancelled') {
        await ctx.http.post(`${base}/deliveries/${delivery.id}/status`).set(bearer(ops.accessToken)).send({ action: 'cancel', reason: 'cancelada para o teste do relatório' }).expect(200);
        return;
      }
      for (const action of ['confirm', 'picked_up']) await ctx.http.post(`${base}/deliveries/${delivery.id}/status`).set(bearer(ops.accessToken)).send({ action }).expect(200);
      const code = (await ctx.db.select().from(deliveries).where(eq(deliveries.id, delivery.id)))[0]!.deliveryCode;
      const last = over.end === 'delivered' ? { action: 'delivered', ...(code ? { code } : {}) } : { action: 'not_delivered', failReason: 'customer_absent' };
      await ctx.http.post(`${base}/deliveries/${delivery.id}/status`).set(bearer(ops.accessToken)).send(last).expect(200);
      if (over.costCents !== undefined) await ctx.http.put(`${base}/deliveries/${delivery.id}/cost`).set(bearer(ops.accessToken)).send({ costCents: over.costCents }).expect(200);
    };
    await make('A', { cityId: cityX.id, feeCents: 800, courierId: courier1, end: 'delivered', costCents: 900 }); // margem -100
    await make('B', { cityId: cityX.id, feeCents: 800, courierId: courier1, end: 'delivered', costCents: 600 }); // +200
    await make('C', { cityId: cityY.id, feeCents: 0, courierId: courier2, end: 'delivered', costCents: 700 }); // frete grátis: -700
    await make('D', { cityId: cityY.id, feeCents: 800, courierId: courier2, end: 'not_delivered' }); // falha do cliente, sem custo ainda
    await make('E', { cityId: cityY.id, feeCents: 800, courierId: courier2, end: 'cancelled' }); // fora do relatório
  });
  afterAll(() => ctx.close());

  const summary = (admin: Admin, extra = '') => ctx.http.get(`${base}/reports/summary?from=${today}&to=${today}&storeId=${storeId}${extra}`).set(bearer(admin.accessToken));
  const payable = (admin: Admin, extra = '') => ctx.http.get(`${base}/reports/payable?from=${today}&to=${today}&storeId=${storeId}${extra}`).set(bearer(admin.accessToken));

  it('perfis: super, operação e financeiro leem; suporte e sem login não', async () => {
    await summary(ops).expect(200);
    await summary(finance).expect(200);
    await summary(support).expect(403);
    await payable(support).expect(403);
    await ctx.http.get(`${base}/reports/summary?from=${today}&to=${today}`).expect(401);
    await ctx.http.get(`${base}/reports/summary?from=${today}&to=2020-01-01`).set(bearer(ops.accessToken)).expect(400);
  });

  it('totais: 4 corridas (a cancelada fica fora), taxa 24,00, custo 22,00, margem -6,00 (só das com custo), subsídio do frete grátis 7,00, falha por motivo', async () => {
    const res = await summary(finance);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const t = res.body.totals;
    expect(t).toMatchObject({
      deliveries: 4,
      finished: 4,
      delivered: 3,
      failuresByReason: { customer_absent: 1 },
      feeCollected: { amount: 2_400 },
      cost: { amount: 2_200 },
      margin: { amount: -600 }, // (800-900) + (800-600) + (0-700); D sem custo não entra na margem
      runsWithoutCost: 1,
      freeShippingDeliveries: 1,
      freeShippingCost: { amount: 700 },
    });
    // pronta há 30 min: atribuída/coletada/entregue logo depois do preparo do teste
    for (const key of ['readyToAssigned', 'readyToCollected', 'readyToDelivered']) {
      expect(t.avgMinutes[key]).toBeGreaterThanOrEqual(29.9);
      expect(t.avgMinutes[key]).toBeLessThan(33);
    }
    expect(t.onTimeLimitMinutes).toBe(60);
    expect(t.onTime).toBe(3);
  });

  it('por cidade: margem negativa destacada (Y: 0 + 8,00 de taxa contra 7,00 de custo registrado, pior margem primeiro) e os totais conferem com as linhas', async () => {
    const body = (await summary(ops)).body;
    const [first, second] = body.byCity as { cityId: string; deliveries: number; fee: { amount: number }; cost: { amount: number }; margin: { amount: number }; negativeMargin: boolean }[];
    expect(first).toMatchObject({ cityId: cityY.id, deliveries: 2, fee: { amount: 800 }, cost: { amount: 700 }, margin: { amount: -700 }, negativeMargin: true });
    expect(second).toMatchObject({ cityId: cityX.id, deliveries: 2, fee: { amount: 1_600 }, cost: { amount: 1_500 }, margin: { amount: 100 }, negativeMargin: false });
    const sum = (key: 'deliveries') => body.byCity.reduce((s: number, c: { deliveries: number }) => s + c[key], 0);
    expect(sum('deliveries')).toBe(body.totals.deliveries);
    expect(body.byCity.reduce((s: number, c: { cost: { amount: number } }) => s + c.cost.amount, 0)).toBe(body.totals.cost.amount);
    // filtro por cidade e por tipo
    expect((await summary(ops, `&cityId=${cityX.id}`)).body.totals).toMatchObject({ deliveries: 2, cost: { amount: 1_500 } });
    expect((await summary(ops, '&kind=exchange_pickup')).body.totals.deliveries).toBe(0);
  });

  it('período sem dados devolve zeros (o app mostra "Sem dados neste período")', async () => {
    const res = await ctx.http.get(`${base}/reports/summary?from=2020-01-01&to=2020-01-02&storeId=${storeId}`).set(bearer(ops.accessToken)).expect(200);
    expect(res.body.totals).toMatchObject({ deliveries: 0, delivered: 0, feeCollected: { amount: 0 }, margin: { amount: 0 }, avgMinutes: { readyToAssigned: null } });
    expect(res.body.byCity).toEqual([]);
  });

  it('a pagar por motoboy: só custo lançado e não pago; mostra quem lançou; quitar tira do relatório; CSV exportado é auditado', async () => {
    const body = (await payable(finance)).body;
    expect(body.total.amount).toBe(2_200);
    expect(body.runs).toBe(3);
    const c1 = body.data.find((r: { courierId: string }) => r.courierId === courier1);
    expect(c1).toMatchObject({ runs: 2, total: { amount: 1_500 }, registeredBy: [ops.userId] });
    expect(body.data.find((r: { courierId: string }) => r.courierId === courier2)).toMatchObject({ runs: 1, total: { amount: 700 } }); // D sem custo e E cancelada: fora

    await ctx.http.post(`${base}/deliveries/payouts`).set(bearer(finance.accessToken)).send({ deliveryIds: [ids.A, ids.B], paidOn: today }).expect(200);
    const after = (await payable(finance)).body;
    expect(after.total.amount).toBe(700);
    expect(after.data).toHaveLength(1);

    const csv = await payable(finance, '&format=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('motoboy_id;motoboy;telefone;corridas;total_centavos');
    expect(csv.text).toContain(`${courier2};`);
    expect(csv.text).not.toContain(courier1);
    const audits = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'logistics.payable.export'));
    expect(audits.some((a) => (a.after as { totalCents?: number } | null)?.totalCents === 700)).toBe(true);
  });
});
