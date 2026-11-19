import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { CommissionService } from '../src/modules/finance/commission.service.js';
import { LedgerService } from '../src/modules/finance/index.js';
import { computeOrderFinance, type OrderFinance } from '../src/modules/finance/domain/commission.js';
import { accountBalance, isBalanced, LEDGER_ACCOUNTS, refundLines, saleLines, providerFeeLines, type LedgerLine } from '../src/modules/finance/domain/ledger.js';
import { orderItems, orders } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCategory, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, makeCoupon, placeOrder, shopWith } from './helpers/orders.js';

/**
 * QA Onda 3 a 5: propriedades numéricas do dinheiro (RN-01, RN-09, RN-10) e "o ledger fecha a conta".
 * Parte A: função pura contra um oráculo independente (BigInt), milhares de casos com semente fixa (reprodutível).
 * Parte B: pedidos reais pela API (Postgres e Redis reais), estornos parciais pelo admin, e a soma de TODO o ledger do banco = 0.
 */

// ---------- oráculo independente (BigInt; não reaproveita money.ts) ----------
const rhu = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d); // half-up para n >= 0
const B = (n: number): bigint => BigInt(n);

/** PRNG determinístico (mulberry32): uma falha é reproduzível pela semente impressa. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const z = (n: number): number => n + 0; // normaliza -0
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/** Maior resto, escrito de novo aqui (empate: menor índice), para conferir `allocateProportional` sem copiar o código dele. */
function oracleShares(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const floors = weights.map((w) => Math.floor((total * w) / sum));
  const rema = weights.map((w, i) => ({ i, rem: (total * w) % sum }));
  let left = total - floors.reduce((a, b) => a + b, 0);
  rema.sort((x, y) => y.rem - x.rem || x.i - y.i);
  for (const { i } of rema) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors;
}

interface Scenario {
  items: { subtotalCents: number; pctBp: number }[];
  storeCouponCents: number;
  platformDiscountCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
}

function randomScenario(r: () => number): Scenario {
  const n = int(r, 1, 4);
  const items = Array.from({ length: n }, () => ({ subtotalCents: r() < 0.1 ? int(r, 1, 50) : int(r, 100, 2_000_000), pctBp: r() < 0.15 ? [0, 1, 3000][int(r, 0, 2)]! : int(r, 0, 3000) }));
  const subtotal = items.reduce((s, i) => s + i.subtotalCents, 0);
  const storeCouponCents = r() < 0.4 ? (r() < 0.1 ? subtotal : int(r, 0, subtotal)) : 0;
  return {
    items,
    storeCouponCents,
    platformDiscountCents: r() < 0.4 ? int(r, 0, Math.max(1, Math.floor(subtotal * 0.8))) : 0,
    deliveryFeeCents: r() < 0.2 ? 0 : int(r, 0, 5_000),
    serviceFeeCents: r() < 0.7 ? 0 : int(r, 0, 500),
  };
}

describe('Parte A: propriedades numéricas da comissão e do ledger (função pura, 20.000 cenários)', () => {
  const SEED = 20261119;
  const CASES = 20_000;

  it('RN-09/RN-10: total = líquido do lojista + application_fee; desconto da plataforma nunca passa da parte da Webag; comissão = soma por item half-up', () => {
    const r = prng(SEED);
    let capped = 0;
    for (let k = 0; k < CASES; k++) {
      const s = randomScenario(r);
      const f = computeOrderFinance(s);
      const ctx = `semente ${SEED}, caso ${k}: ${JSON.stringify(s)}`;
      const subtotal = s.items.reduce((a, i) => a + i.subtotalCents, 0);
      // 1. rateio do cupom da loja: soma exata, cada parte dentro do item, e a 1 centavo do proporcional
      const shares = oracleShares(s.storeCouponCents, s.items.map((i) => i.subtotalCents));
      expect(shares.reduce((a, b) => a + b, 0), ctx).toBe(s.storeCouponCents);
      // 2. comissão = Σ round_half_up(base_i x pct_i), com a base já líquida do cupom da loja (oráculo BigInt)
      const oracleCommission = s.items.reduce((a, item, i) => a + rhu(B(item.subtotalCents - shares[i]!) * B(item.pctBp), 10_000n), 0n);
      expect(BigInt(f.commissionCents), ctx).toBe(oracleCommission);
      // 3. identidades do modelo (DEC-036): total e application_fee
      const cap = f.commissionCents + s.deliveryFeeCents + s.serviceFeeCents;
      const discount = Math.min(s.platformDiscountCents, cap);
      expect(f.platformDiscountCents, ctx).toBe(discount);
      expect(f.applicationFeeCents, ctx).toBe(cap - discount);
      expect(f.applicationFeeCents, ctx).toBeGreaterThanOrEqual(0); // a Webag nunca paga ao lojista por fora
      expect(f.totalCents, ctx).toBe(subtotal - s.storeCouponCents + s.deliveryFeeCents + s.serviceFeeCents - discount);
      expect(f.totalCents, ctx).toBe(f.merchantNetBeforeProviderFeeCents + f.applicationFeeCents);
      expect(f.totalCents, ctx).toBeGreaterThanOrEqual(0);
      // 4. a comissão nunca passa da base; o lojista nunca recebe negativo
      expect(f.commissionCents, ctx).toBeLessThanOrEqual(subtotal - s.storeCouponCents);
      expect(f.merchantNetBeforeProviderFeeCents, ctx).toBeGreaterThanOrEqual(0);
      expect(f.platformDiscountCapped, ctx).toBe(discount < s.platformDiscountCents);
      if (f.platformDiscountCapped) capped++;
    }
    expect(capped, 'o gerador precisa exercitar o corte do cupom da plataforma').toBeGreaterThan(500);
  });

  it('exemplo da RN-10 (R$ 100,00, cupom da loja R$ 10,00, entrega R$ 8,00, comissão 15%): total 98,00, comissão 13,50, application_fee 21,50, líquido 90 - 13,50 = 76,50', () => {
    const f = computeOrderFinance({ items: [{ subtotalCents: 10_000, pctBp: 1500 }], storeCouponCents: 1_000, platformDiscountCents: 0, deliveryFeeCents: 800, serviceFeeCents: 0 });
    expect(f).toMatchObject({ totalCents: 9_800, commissionCents: 1_350, applicationFeeCents: 2_150, merchantNetBeforeProviderFeeCents: 7_650 });
    // taxa PIX 0,99% sobre 98,00 = 0,97 => 75,53 (exemplo da RN)
    expect(7_650 - Number(rhu(9_800n * 99n, 10_000n))).toBe(7_553);
  });

  it('venda: lançamento fecha; o provedor recebe o total; a Webag recebe comissão + entrega + serviço - promo; o lojista, o líquido', () => {
    const r = prng(SEED + 1);
    for (let k = 0; k < 5_000; k++) {
      const f = computeOrderFinance(randomScenario(r));
      const lines = saleLines(f);
      expect(isBalanced(lines)).toBe(true);
      const bal = (a: (typeof LEDGER_ACCOUNTS)[number]) => accountBalance(lines, a);
      expect(bal('provider_clearing')).toBe(f.totalCents);
      expect(z(-bal('merchant_payable'))).toBe(f.merchantNetBeforeProviderFeeCents);
      // receita da Webag = application_fee (comissão + entrega + serviço - promo)
      expect(z(-bal('commission_revenue') - bal('delivery_fee_revenue') - bal('service_fee_revenue') - bal('platform_promo_expense'))).toBe(f.applicationFeeCents);
    }
  });

  /** Estado acumulado do ledger de um pedido, por conta (crédito positivo nas receitas). */
  const state = (lines: LedgerLine[]) => Object.fromEntries(LEDGER_ACCOUNTS.map((a) => [a, accountBalance(lines, a)])) as Record<(typeof LEDGER_ACCOUNTS)[number], number>;

  function randomPartition(r: () => number, total: number): number[] {
    const parts: number[] = [];
    let left = total;
    while (left > 0) {
      const p = r() < 0.15 ? left : int(r, 1, Math.max(1, Math.min(left, Math.ceil(total / 2))));
      parts.push(p);
      left -= p;
    }
    return parts;
  }

  it('estornos parciais em qualquer partição: cada lançamento fecha, nada negativo, caminho-independente e o total estornado zera TUDO (menos a tarifa do provedor)', () => {
    const r = prng(SEED + 2);
    let multi = 0;
    for (let k = 0; k < 6_000; k++) {
      const s = randomScenario(r);
      const f = computeOrderFinance(s);
      if (f.totalCents === 0) continue;
      const ctx = `semente ${SEED + 2}, caso ${k}: ${JSON.stringify(s)}`;
      const sale = saleLines(f);
      const parts = randomPartition(r, f.totalCents);
      if (parts.length > 1) multi++;
      let all = [...sale];
      let refunded = 0;
      let prevCommission = state(all).commission_revenue;
      for (const p of parts) {
        const lines = refundLines(f, refunded, p);
        expect(isBalanced(lines), ctx).toBe(true);
        expect(lines.every((l) => l.amountCents > 0), 'nunca grava valor <= 0').toBe(true);
        all = [...all, ...lines];
        refunded += p;
        const st = state(all);
        // receitas voltam só até zero e nunca invertem de sinal; só diminuem (a Webag não "ganha" com estorno)
        for (const a of ['commission_revenue', 'delivery_fee_revenue', 'service_fee_revenue'] as const) expect(z(-st[a]), `${a} negativa: ${ctx}`).toBeGreaterThanOrEqual(0);
        expect(z(-st.commission_revenue), ctx).toBeLessThanOrEqual(z(-prevCommission));
        prevCommission = st.commission_revenue;
        expect(st.platform_promo_expense, ctx).toBeGreaterThanOrEqual(0);
        expect(st.platform_promo_expense, ctx).toBeLessThanOrEqual(f.platformDiscountCents);
        // o dinheiro no provedor = pago - estornado, sempre
        expect(st.provider_clearing, ctx).toBe(f.totalCents - refunded);
        // o lojista nunca fica devendo por um estorno de pedido que ele recebeu (a conta a favor dele não pode ficar negativa)
        expect(z(-st.merchant_payable), `lojista ficou devendo ${-st.merchant_payable} centavos após estorno parcial: ${ctx}`).toBeGreaterThanOrEqual(0);
      }
      const end = state(all);
      for (const a of LEDGER_ACCOUNTS) expect(z(end[a]), `${a} não zerou no estorno total: ${ctx}`).toBe(0);
      // caminho-independência: estornar tudo em 1 passo dá o mesmo estado de cada acumulado intermediário
      const mid = Math.floor(f.totalCents / 3);
      if (mid > 0) {
        const stepwise = [...sale, ...refundLines(f, 0, mid), ...refundLines(f, mid, f.totalCents - mid)];
        const oneShot = [...sale, ...refundLines(f, 0, f.totalCents)];
        expect(state(stepwise), ctx).toEqual(state(oneShot));
      }
    }
    expect(multi, 'o gerador precisa produzir estornos em várias parcelas').toBeGreaterThan(2_000);
  });

  it('tarifa do provedor não volta no estorno (HIP-016): após estorno total sobra só a tarifa, paga pelo lojista, e o lançamento fecha', () => {
    const r = prng(SEED + 3);
    for (let k = 0; k < 3_000; k++) {
      const f = computeOrderFinance(randomScenario(r));
      if (f.totalCents < 100) continue;
      const fee = int(r, 0, Math.floor(f.totalCents * 0.06));
      const all = [...saleLines(f), ...providerFeeLines(fee), ...refundLines(f, 0, f.totalCents)];
      const st = state(all);
      expect(isBalanced(all)).toBe(true);
      expect(z(st.provider_clearing)).toBe(z(-fee)); // saiu do provedor a tarifa que o provedor ficou
      expect(z(-st.merchant_payable)).toBe(z(-fee)); // a tarifa é do lojista (split)
      expect(st.commission_revenue + st.delivery_fee_revenue + st.service_fee_revenue + st.platform_promo_expense).toBe(0);
    }
  });

  it('estorno acima do pago ou de valor zero é recusado pela função pura', () => {
    const f = computeOrderFinance({ items: [{ subtotalCents: 1_000, pctBp: 1500 }], storeCouponCents: 0, platformDiscountCents: 0, deliveryFeeCents: 500, serviceFeeCents: 0 });
    expect(() => refundLines(f, 0, f.totalCents + 1)).toThrow();
    expect(() => refundLines(f, 0, 0)).toThrow();
    expect(() => refundLines(f, f.totalCents, 1)).toThrow();
  });
});

// ---------- Parte B: pedidos reais ----------
describe('Parte B: pedidos reais pela API com valores aleatórios; o ledger de todo o banco soma zero', () => {
  let ctx: TestContext;
  let ledger: LedgerService;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  const created: { orderId: string; refunded: number }[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ledger = ctx.app.get(LedgerService);
    admin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(() => ctx.close());

  it('12 pedidos com preços, quantidades, categorias, comissões e cupons aleatórios: o que a API cobra e lança bate com o oráculo independente', async () => {
    const r = prng(777);
    const commissions = ctx.app.get(CommissionService);
    for (let k = 0; k < 12; k++) {
      const categoryA = await ensureCategory(ctx);
      const categoryB = await ensureCategory(ctx);
      const specs = Array.from({ length: int(r, 1, 3) }, (_, i) => ({ name: `Item ${k}-${i}`, priceCents: int(r, 150, 30_000), stock: 50, categoryId: i % 2 === 0 ? categoryA : categoryB }));
      const shop = await shopWith(ctx, specs);
      const pctA = int(r, 0, 3000);
      const pctB = int(r, 0, 3000);
      const storePct = r() < 0.3 ? int(r, 0, 3000) : null;
      await commissions.setCategoryRate(categoryA, { pctBp: pctA, reason: 'QA propriedade' }, null);
      await commissions.setCategoryRate(categoryB, { pctBp: pctB, reason: 'QA propriedade' }, null);
      if (storePct !== null) await commissions.setStoreRate(shop.store.id, { pctBp: storePct, reason: 'QA propriedade' }, null);
      const buyer = await customerAt(ctx, shop.origin);
      const qtys = specs.map(() => int(r, 1, 3));
      for (const [i, v] of shop.variants.entries()) await addToCart(ctx, buyer.user, v, qtys[i]!).expect(200);
      const subtotal = specs.reduce((s, sp, i) => s + sp.priceCents * qtys[i]!, 0);
      if (subtotal < 100) continue; // total mínimo do cupom (HIP-037) tem teste próprio
      // cupom: nenhum, da loja (fixo) ou da plataforma (fixo ou percentual)
      const pick = r();
      let storeCoupon = 0;
      let platformFace = 0;
      if (pick < 0.3) {
        storeCoupon = int(r, 50, Math.max(50, Math.floor(subtotal / 2)));
        const c = await makeCoupon(ctx, { kind: 'fixed', scope: 'store', storeId: shop.store.id, value: storeCoupon });
        await ctx.http.put('/v1/cart/coupon').set(bearer(buyer.user.accessToken)).send({ code: c.code }).expect(200);
      } else if (pick < 0.6) {
        platformFace = int(r, 50, Math.max(50, Math.floor(subtotal / 2)));
        const c = await makeCoupon(ctx, { kind: 'fixed', scope: 'platform', value: platformFace });
        await ctx.http.put('/v1/cart/coupon').set(bearer(buyer.user.accessToken)).send({ code: c.code }).expect(200);
      }
      const res = await placeOrder(ctx, buyer.user, buyer.addressId, { paymentMethod: r() < 0.5 ? 'pix' : 'pix' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const orderId = res.body.id as string;

      // oráculo: percentuais por item (loja > categoria), rateio do cupom da loja, comissão, taxa de entrega 500 (tabela do admin)
      const pcts = specs.map((_, i) => storePct ?? (i % 2 === 0 ? pctA : pctB));
      const weights = specs.map((sp, i) => sp.priceCents * qtys[i]!);
      const shares = oracleShares(storeCoupon, weights);
      const commission = weights.reduce((a, w, i) => a + rhu(B(w - shares[i]!) * B(pcts[i]!), 10_000n), 0n);
      const delivery = 500;
      const cap = Number(commission) + delivery;
      const platformDiscount = Math.min(platformFace, cap);
      const expectedTotal = subtotal - storeCoupon + delivery - platformDiscount;
      const row = (await ctx.db.select().from(orders).where(eq(orders.id, orderId)))[0]!;
      expect(row, `pedido ${k}`).toMatchObject({ totalCents: expectedTotal, commissionCents: Number(commission), applicationFeeCents: cap - platformDiscount, storeCouponCents: storeCoupon, platformDiscountCents: platformDiscount, deliveryFeeCents: delivery });
      const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      expect(items.map((i) => i.commissionPctBp).sort()).toEqual([...pcts].sort());

      const attempt = await attemptOf(ctx, orderId);
      expect(attempt).toMatchObject({ amountCents: expectedTotal, applicationFeeCents: cap - platformDiscount }); // o que o provedor cobra e retém
      await approve(ctx, buyer.user, attempt.id);
      const b = await ledger.balances(orderId);
      expect(b).toMatchObject({ paidCents: expectedTotal, commissionRevenue: Number(commission), deliveryFeeRevenue: delivery, platformPromoExpense: platformDiscount });
      expect(b.merchantPayable + b.providerFeeCents).toBe(subtotal - storeCoupon - Number(commission)); // líquido do lojista = itens - cupom da loja - comissão (- tarifa)
      expect((await ledger.verifyOrder(orderId)).ok).toBe(true);
      created.push({ orderId, refunded: 0 });

      // estornos parciais pelo admin (super admin: sem limite), 0 a 3 parcelas, às vezes tudo
      let refunded = 0;
      const steps = int(r, 0, 3);
      for (let s = 0; s < steps; s++) {
        const left = expectedTotal - refunded;
        if (left < 1) break;
        const amount = s === steps - 1 && r() < 0.5 ? left : int(r, 1, left);
        const rr = await ctx.http.post(`/v1/admin/orders/${orderId}/refunds`).set(bearer(admin.accessToken)).set('Idempotency-Key', randomUUID()).send({ amountCents: amount, reason: 'QA propriedade do ledger' });
        expect(rr.status, JSON.stringify(rr.body)).toBe(200);
        refunded += amount;
        const bb = await ledger.balances(orderId);
        expect(bb.refundedCents).toBe(refunded);
        expect(bb.providerClearing).toBe(expectedTotal - refunded - bb.providerFeeCents);
        expect(bb.merchantPayable + bb.providerFeeCents, `loja a favor negativa (sem contar a tarifa do provedor) após estorno parcial (pedido ${k})`).toBeGreaterThanOrEqual(0);
        expect((await ledger.verifyOrder(orderId)).ok).toBe(true);
      }
      created[created.length - 1]!.refunded = refunded;
    }
    expect(created.length).toBeGreaterThanOrEqual(10);
  });

  it('SOMA DE TODO O LEDGER = 0: débitos = créditos no banco inteiro e por lançamento, e a conta do provedor bate com pago - estornado - tarifa', async () => {
    const [row] = (
      await ctx.db.execute(sql`
        select coalesce(sum(case direction when 'debit' then amount_cents else -amount_cents end), 0)::bigint as diff,
               (select count(*) from ledger_transactions t where not exists (select 1 from ledger_entries e where e.transaction_id = t.id))::int as lonely
        from ledger_entries`)
    ).rows as { diff: string; lonely: number }[];
    expect(Number(row!.diff)).toBe(0);
    expect(row!.lonely, 'lançamento sem linhas').toBe(0);
    const unbalanced = (await ctx.db.execute(sql`select t.id from ledger_transactions t join ledger_entries e on e.transaction_id = t.id group by t.id having sum(case e.direction when 'debit' then e.amount_cents else -e.amount_cents end) <> 0`)).rows;
    expect(unbalanced).toHaveLength(0);
    expect(await ledger.unbalancedOrders(created.map((c) => c.orderId))).toEqual([]);
    // todo valor é positivo e inteiro (nunca float nem negativo)
    const bad = ((await ctx.db.execute(sql`select count(*)::int as bad from ledger_entries where amount_cents <= 0`)).rows as { bad: number }[])[0]!.bad;
    expect(bad).toBe(0);
  });

  it('estorno total pelo admin zera a receita do pedido (nenhuma comissão, taxa de entrega ou promo sobra) e no provedor sobra só a tarifa (HIP-016)', async () => {
    const full = created.find((c) => c.refunded > 0);
    expect(full, 'pelo menos um pedido estornado').toBeDefined();
    const fully = [];
    for (const c of created) {
      const [o] = await ctx.db.select().from(orders).where(eq(orders.id, c.orderId));
      if (o!.totalCents === c.refunded) fully.push(c.orderId);
    }
    for (const id of fully) {
      const b = await ledger.balances(id);
      // sobra só a tarifa do provedor (HIP-016: não volta), que fica com o lojista; nada de receita da Webag
      expect(b).toMatchObject({ commissionRevenue: 0, deliveryFeeRevenue: 0, serviceFeeRevenue: 0, platformPromoExpense: 0, merchantPayable: z(-b.providerFeeCents), providerClearing: z(-b.providerFeeCents) });
    }
  });
});
