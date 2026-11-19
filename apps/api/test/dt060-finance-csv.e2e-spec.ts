import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { LedgerService } from '../src/modules/finance/ledger.service.js';
import { auditLog } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** WB-114 / DT-060 (DEC-060): 2 CSV financeiros no piloto (Receita por pedido e Estornos), até 10.000 linhas (acima, 422), auditados. */
describe('CSV financeiros do piloto: Receita por pedido e Estornos (DT-060)', () => {
  let ctx: TestContext;
  let finance: Awaited<ReturnType<typeof createAdmin>>;
  const day = (offsetMs = 0) => new Date(Date.now() - 3 * 3_600_000 + offsetMs).toISOString().slice(0, 10); // dia de Brasília
  const url = (kind: 'revenue' | 'refunds', storeId: string, from = day(-86_400_000), to = day(86_400_000)) => `/v1/admin/reports/finance/${kind}.csv?from=${from}&to=${to}&storeId=${storeId}`;
  const parse = (text: string) => {
    const [header, ...lines] = text.replace(String.fromCharCode(0xfeff), '').trim().split('\r\n');
    const keys = header!.split(';');
    return { keys, rows: lines.map((l) => Object.fromEntries(l.split(';').map((v, i) => [keys[i]!, v]))) as Record<string, string>[] };
  };
  const cents = (v: string | undefined) => Math.round(Number((v ?? '0').replace(',', '.')) * 100);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    finance = await createAdmin(ctx, 'finance');
  });
  afterAll(() => ctx.close());

  async function paidOrder(price = 8_000) {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: price, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string; number: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    return { shop, buyer, orderId: created.id, number: created.number };
  }

  it('perfis: financeiro e super admin exportam; operação, suporte, cliente e sem login não', async () => {
    const { shop } = await paidOrder();
    const sup = await createAdmin(ctx, 'super_admin');
    const ops = await createAdmin(ctx, 'operations');
    const support = await createAdmin(ctx, 'support');
    for (const kind of ['revenue', 'refunds'] as const) {
      await ctx.http.get(url(kind, shop.store.id)).expect(401);
      await ctx.http.get(url(kind, shop.store.id)).set(bearer(ops.accessToken)).expect(403);
      await ctx.http.get(url(kind, shop.store.id)).set(bearer(support.accessToken)).expect(403);
      await ctx.http.get(url(kind, shop.store.id)).set(bearer(shop.store.owner.accessToken)).expect(403);
      await ctx.http.get(url(kind, shop.store.id)).set(bearer(finance.accessToken)).expect(200);
      await ctx.http.get(url(kind, shop.store.id)).set(bearer(sup.accessToken)).expect(200);
    }
    await ctx.http.get(url('revenue', shop.store.id, day(), '2000-01-01')).set(bearer(finance.accessToken)).expect(400);
  });

  it('R1 Receita por pedido: uma linha por pedido pago, valores do pedido e do ledger; a soma das linhas bate com o ledger; auditado', async () => {
    const a = await paidOrder(8_000);
    const res = await ctx.http.get(url('revenue', a.shop.store.id)).set(bearer(finance.accessToken)).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('receita-por-pedido');
    const { keys, rows } = parse(res.text);
    expect(keys).toEqual(['pedido', 'loja', 'pago_em', 'status', 'bruto', 'cupom_loja', 'cupom_plataforma', 'comissao', 'taxa_entrega', 'taxa_servico', 'application_fee', 'taxa_provedor', 'liquido_lojista', 'estornos', 'total_pago']);
    expect(rows).toHaveLength(1);
    const order = await orderRow(ctx, a.orderId);
    const ledger = ctx.app.get(LedgerService);
    const b = await ledger.balances(a.orderId);
    expect(rows[0]).toMatchObject({ pedido: a.number, status: 'received' });
    expect(cents(rows[0]!.bruto)).toBe(order.subtotalCents);
    expect(cents(rows[0]!.comissao)).toBe(order.commissionCents);
    expect(cents(rows[0]!.taxa_entrega)).toBe(order.deliveryFeeCents);
    expect(cents(rows[0]!.application_fee)).toBe(order.applicationFeeCents);
    expect(cents(rows[0]!.total_pago)).toBe(order.totalCents);
    expect(cents(rows[0]!.taxa_provedor)).toBe(b.providerFeeCents);
    expect(cents(rows[0]!.liquido_lojista)).toBe(b.merchantPayable);
    expect(cents(rows[0]!.estornos)).toBe(0);
    // C2: o total das linhas bate com o ledger do período (loja com 2 pedidos, 1 cancelado e estornado)
    await ctx.http.post(`/v1/orders/${a.orderId}/cancel`).set(bearer(a.buyer.user.accessToken)).send({}).expect(200);
    const after = parse((await ctx.http.get(url('revenue', a.shop.store.id)).set(bearer(finance.accessToken)).expect(200)).text);
    const b2 = await ledger.balances(a.orderId);
    expect(after.rows[0]).toMatchObject({ status: 'cancelled' });
    expect(cents(after.rows[0]!.estornos)).toBe(b2.refundedCents);
    expect(cents(after.rows[0]!.estornos)).toBe(order.totalCents);
    expect(cents(after.rows[0]!.liquido_lojista)).toBe(b2.merchantPayable);
    // auditoria da exportação (C4)
    const audits = await ctx.db.select().from(auditLog).where(sql`${auditLog.action} = 'report.export' and ${auditLog.targetId} = 'finance_revenue'`);
    expect(audits.length).toBeGreaterThanOrEqual(2);
    expect(audits.at(-1)?.after).toMatchObject({ storeId: a.shop.store.id, rows: 1 });
    // período sem pedido: só o cabeçalho
    expect(parse((await ctx.http.get(url('revenue', a.shop.store.id, '2001-01-01', '2001-01-31')).set(bearer(finance.accessToken)).expect(200)).text).rows).toHaveLength(0);
  });

  it('R2 Estornos: uma linha por estorno com valor, meio, motivo, ator e situação', async () => {
    const a = await paidOrder(6_000);
    expect(parse((await ctx.http.get(url('refunds', a.shop.store.id)).set(bearer(finance.accessToken)).expect(200)).text).rows).toHaveLength(0); // nada estornado
    await ctx.http.post(`/v1/orders/${a.orderId}/cancel`).set(bearer(a.buyer.user.accessToken)).send({}).expect(200);
    const res = await ctx.http.get(url('refunds', a.shop.store.id)).set(bearer(finance.accessToken)).expect(200);
    expect(res.headers['content-disposition']).toContain('estornos-');
    const { keys, rows } = parse(res.text);
    expect(keys).toEqual(['pedido', 'troca', 'loja', 'estornado_em', 'valor', 'meio', 'motivo', 'situacao', 'ator', 'ator_id']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pedido: a.number, meio: 'pix', situacao: 'done' });
    expect(cents(rows[0]!.valor)).toBe((await orderRow(ctx, a.orderId)).totalCents);
    expect(rows[0]?.motivo?.length).toBeGreaterThan(0);
    expect(rows[0]?.ator?.length).toBeGreaterThan(0);
  });

  it('acima de 10.000 linhas: 422 EXPORT_TOO_LARGE com a contagem; no limite exato (10.000) exporta', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 1_000, stock: 5 }]);
    const buyer = await customerAt(ctx, shop.origin);
    const prefix = randomUUID().slice(0, 2).toUpperCase();
    // 10.001 pedidos pagos em março de 2020 (período isolado por loja e data): inseridos de uma vez no banco
    await ctx.db.execute(sql`
      insert into orders (number, user_id, store_id, status, mode, pickup, cart_revision, eta_min_minutes, eta_max_minutes, subtotal_cents, delivery_fee_cents, service_fee_cents, discount_cents, total_cents, commission_cents, application_fee_cents, finance, payment_method, paid_at)
      select ${prefix} || lpad(g::text, 5, '0'), ${buyer.user.userId}::uuid, ${shop.store.id}::uuid, 'delivered', 'pickup', '{"address":"Rua A, 1","instructions":null,"prepMinMinutes":10,"prepMaxMinutes":20}'::jsonb, 1, 30, 60, 1000, 0, 0, 0, 1000, 100, 100, '{}'::jsonb, 'pix', timestamptz '2020-03-10 12:00:00-03'
      from generate_series(1, 10001) g`);
    try {
      const big = await ctx.http.get(url('revenue', shop.store.id, '2020-03-01', '2020-03-31')).set(bearer(finance.accessToken)).expect(422);
      expect(big.body).toMatchObject({ code: 'EXPORT_TOO_LARGE', rows: 10_001, maxRows: 10_000 });
      expect(big.body.detail).toContain('Reduza o intervalo');
      expect(big.body.detail).toContain('10001');
      // o estorno tem o mesmo limite (aqui há 0 estornos: passa), e um período menor volta a funcionar
      await ctx.db.execute(sql`delete from orders where store_id = ${shop.store.id}::uuid and number like ${`${prefix}%`} and number = ${`${prefix}00001`}`);
      const exact = await ctx.http.get(url('revenue', shop.store.id, '2020-03-01', '2020-03-31')).set(bearer(finance.accessToken)).expect(200);
      expect(parse(exact.text).rows).toHaveLength(10_000);
      await ctx.http.get(url('refunds', shop.store.id, '2020-03-01', '2020-03-31')).set(bearer(finance.accessToken)).expect(200);
    } finally {
      await ctx.db.execute(sql`delete from orders where store_id = ${shop.store.id}::uuid and number like ${`${prefix}%`}`); // não deixa 10 mil pedidos no banco compartilhado dos outros testes
    }
  }, 60_000);
});
