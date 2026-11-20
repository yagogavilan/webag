import { eq } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/ledger.service.js';
import { auditLog, orders, storeMembers } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createCustomer, ensureCity, ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, shopWith, placeOrder, type Shop } from './helpers/orders.js';

/** Financeiro da loja (WB-075 a WB-077): vendas, comissão, líquido, a receber e extrato em CSV, com as permissões da RN-13. */
describe('Financeiro do lojista: vendas, comissão, a receber e extrato (RN-10, RN-13)', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ledger = ctx.app.get(LedgerService);
  });
  afterAll(() => ctx.close());

  const owner = (shop: Shop) => bearer(shop.store.owner.accessToken);
  const brt = (offsetDays: number) => new Date(Date.now() - 3 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
  const range = `from=${brt(-2)}&to=${brt(1)}`;

  const paidOrder = async (shop: Shop, quantity: number) => {
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, quantity).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    return created.id;
  };

  it('resumo e extrato batem com o ledger: vendas sem frete, comissão, estorno devolvido proporcional, líquido e situação (a receber, em carência)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 50 }]);
    const a = await paidOrder(shop, 1);
    const b = await paidOrder(shop, 2);
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, a)); // entregue agora: em carência
    await ledger.recordRefund(ctx.db, { orderId: b, refundCents: 5_000, refundKey: `t:${b}`, reason: 'teste' });
    const [orderA] = await ctx.db.select().from(orders).where(eq(orders.id, a));
    const [orderB] = await ctx.db.select().from(orders).where(eq(orders.id, b));
    const balancesA = await ledger.balances(a);
    const balancesB = await ledger.balances(b);

    const summary = (await ctx.http.get(`/v1/stores/${shop.store.id}/finance/summary?${range}`).set(owner(shop)).expect(200)).body;
    expect(summary.sales).toMatchObject({ orders: 2, gross: { amount: 30_000 }, averageTicket: { amount: 15_000 } }); // R$ 100 + R$ 200, sem frete
    expect(summary.commission.charged.amount).toBe(orderA!.commissionCents + orderB!.commissionCents);
    expect(summary.commission.returned.amount).toBeGreaterThan(0); // a comissão do estorno parcial voltou
    expect(summary.refunds.amount).toBe(5_000);
    expect(summary.net.amount).toBe(balancesA.merchantPayable + balancesB.merchantPayable);
    expect(summary.receivable).toMatchObject({ informational: true, inGrace: { orders: 1, amount: { amount: balancesA.merchantPayable } }, pending: { orders: 1, amount: { amount: balancesB.merchantPayable } }, released: { orders: 0 } });

    const statement = (await ctx.http.get(`/v1/stores/${shop.store.id}/finance/statement?${range}`).set(owner(shop)).expect(200)).body;
    expect(statement.data).toHaveLength(2);
    const lineB = statement.data.find((l: { orderId: string }) => l.orderId === b);
    expect(lineB).toMatchObject({ gross: { amount: 20_000 }, refunds: { amount: 5_000 }, net: { amount: balancesB.merchantPayable }, payoutStatus: 'pending' });
    expect(statement.data.find((l: { orderId: string }) => l.orderId === a)).toMatchObject({ payoutStatus: 'in_grace', commission: { amount: orderA!.commissionCents } });

    // paginação por cursor
    const first = (await ctx.http.get(`/v1/stores/${shop.store.id}/finance/statement?${range}&limit=1`).set(owner(shop)).expect(200)).body;
    expect(first.data).toHaveLength(1);
    const second = (await ctx.http.get(`/v1/stores/${shop.store.id}/finance/statement?${range}&limit=1&cursor=${first.nextCursor}`).set(owner(shop)).expect(200)).body;
    expect(second.data).toHaveLength(1);
    expect(second.data[0].orderId).not.toBe(first.data[0].orderId);
    expect(second.nextCursor).toBeNull();

    // CSV: BOM, separador ";", reais com vírgula, e a exportação é auditada
    const csv = await ctx.http.get(`/v1/stores/${shop.store.id}/finance/statement.csv?${range}`).set(owner(shop)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toContain('pedido;pago_em;status_pedido;vendas;comissao');
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.includes('200,00') && l.includes('50,00') && l.includes('a receber'))).toBe(true);
    const audit = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'store.finance.export'));
    expect(audit.some((r) => r.targetId === shop.store.id)).toBe(true);
    // período sem vendas
    const empty = (await ctx.http.get(`/v1/stores/${shop.store.id}/finance/summary?from=2001-01-01&to=2001-01-31`).set(owner(shop)).expect(200)).body;
    expect(empty.sales.orders).toBe(0);
    expect(empty.net.amount).toBe(0);
  });

  it('permissões: funcionário com sales_values vê só vendas (sem comissão, líquido nem extrato); sem a permissão, nada; outra loja e cliente recebem 404', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 50 }]);
    await paidOrder(shop, 1);
    const withValues = await registerUser(ctx);
    const without = await registerUser(ctx);
    await ctx.db.insert(storeMembers).values([
      { storeId: shop.store.id, userId: withValues.userId, role: 'staff', permissions: ['orders', 'sales_values'] },
      { storeId: shop.store.id, userId: without.userId, role: 'staff', permissions: ['orders'] },
    ]);
    const get = (path: string, token: string) => ctx.http.get(`/v1/stores/${shop.store.id}/finance/${path}?${range}`).set(bearer(token));
    const sales = (await get('sales', withValues.accessToken).expect(200)).body;
    expect(sales).toMatchObject({ orders: 1, gross: { amount: 10_000 } });
    expect(JSON.stringify(sales)).not.toMatch(/commission|net/);
    for (const path of ['summary', 'statement', 'statement.csv']) expect((await get(path, withValues.accessToken)).status, path).toBe(403);
    expect((await get('sales', without.accessToken)).status).toBe(403);

    const other = await shopWith(ctx, [{ name: 'Outra', priceCents: 1_000, stock: 5 }]);
    const stranger = await createCustomer(ctx);
    for (const path of ['sales', 'summary', 'statement', 'statement.csv']) {
      expect((await ctx.http.get(`/v1/stores/${shop.store.id}/finance/${path}?${range}`).set(owner(other))).status, `outra loja ${path}`).toBe(404);
      expect((await get(path, stranger.accessToken)).status, `cliente ${path}`).toBe(404);
      expect((await ctx.http.get(`/v1/stores/${shop.store.id}/finance/${path}?${range}`)).status, `anônimo ${path}`).toBe(401);
    }
    expect((await ctx.http.get(`/v1/stores/${shop.store.id}/finance/summary?from=2026-02-01&to=2026-01-01`).set(owner(shop))).status).toBe(400);
    expect((await ctx.http.get(`/v1/stores/${shop.store.id}/finance/summary?from=2020-01-01&to=2026-01-01`).set(owner(shop))).status).toBe(400);
  });
});
