import { computeOrderFinance, resolveCommission, type OrderFinanceInput } from './commission.js';
import { accountBalance, isBalanced, providerFeeLines, refundLines, saleLines, type LedgerLine } from './ledger.js';
import { allocateProportional, applyBp, pctToBp } from './money.js';

/** PRNG determinístico (mulberry32): o teste de propriedade reproduz a mesma semente sempre. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

describe('exemplo da RN-10 com a logística da Webag (WB-156 C3, WB-238 C2, DEC-036)', () => {
  // Subtotal R$ 100,00, cupom da loja R$ 10,00, entrega R$ 8,00, comissão 15%.
  const finance = computeOrderFinance({ items: [{ subtotalCents: 10_000, pctBp: pctToBp(15) }], storeCouponCents: 1000, platformDiscountCents: 0, deliveryFeeCents: 800, serviceFeeCents: 0 });
  it('base 90,00, comissão 13,50, total do cliente 98,00 e application_fee = comissão + entrega = 21,50', () => {
    expect(finance).toMatchObject({ baseCents: 9000, commissionCents: 1350, totalCents: 9800, merchantGrossCents: 9000, applicationFeeCents: 2150, platformRevenueCents: 2150 });
  });
  it('PIX 0,99%: taxa 97 e líquido do lojista 75,53; cartão 4,98%: taxa 488 e líquido 71,62', () => {
    const pixFee = applyBp(9800, 99);
    expect(pixFee).toBe(97);
    expect(finance.merchantNetBeforeProviderFeeCents).toBe(7650);
    expect(finance.merchantNetBeforeProviderFeeCents - pixFee).toBe(7553);
    const cardFee = applyBp(9800, 498);
    expect(cardFee).toBe(488);
    expect(finance.merchantNetBeforeProviderFeeCents - cardFee).toBe(7162);
  });
  it('o ledger fecha: loja 75,53, comissão 13,50 e taxa de entrega 8,00 são da Webag (receita 21,50)', () => {
    const lines = [...saleLines(finance), ...providerFeeLines(97)];
    expect(isBalanced(lines)).toBe(true);
    expect(-accountBalance(lines, 'merchant_payable')).toBe(7553);
    expect(-accountBalance(lines, 'commission_revenue')).toBe(1350);
    expect(-accountBalance(lines, 'delivery_fee_revenue')).toBe(800);
    expect(accountBalance(lines, 'provider_clearing')).toBe(9800 - 97);
  });
  it('estorno total devolve comissão e entrega e zera a loja; parcial devolve proporcional e a soma fecha sem perder centavo', () => {
    const sale = saleLines(finance);
    const total = refundLines(finance, 0, 9800);
    expect(isBalanced(total)).toBe(true);
    expect(accountBalance([...sale, ...total], 'delivery_fee_revenue')).toBe(0);
    expect(accountBalance([...sale, ...total], 'commission_revenue')).toBe(0);
    expect(accountBalance([...sale, ...total], 'merchant_payable')).toBe(0);
    // 3 estornos parciais somam o mesmo que o total
    const parts = [3000, 3333, 3467].reduce<{ before: number; lines: ReturnType<typeof refundLines> }>((acc, cents) => ({ before: acc.before + cents, lines: [...acc.lines, ...refundLines(finance, acc.before, cents)] }), { before: 0, lines: [] });
    expect(accountBalance([...sale, ...parts.lines], 'delivery_fee_revenue')).toBe(0);
    expect(accountBalance([...sale, ...parts.lines], 'commission_revenue')).toBe(0);
    expect(accountBalance([...sale, ...parts.lines], 'merchant_payable')).toBe(0);
  });
});

describe('frete grátis é subsídio da Webag (RN-04, RN-10)', () => {
  it('cupom de frete grátis (desconto da plataforma) reduz só a parte da Webag; o lojista recebe o mesmo', () => {
    const base = { items: [{ subtotalCents: 10_000, pctBp: 1500 }], storeCouponCents: 0, deliveryFeeCents: 800, serviceFeeCents: 0 };
    const paid = computeOrderFinance({ ...base, platformDiscountCents: 0 });
    const free = computeOrderFinance({ ...base, platformDiscountCents: 800 });
    expect(free.merchantNetBeforeProviderFeeCents).toBe(paid.merchantNetBeforeProviderFeeCents); // 8.500
    expect(free.totalCents).toBe(10_000);
    expect(free.applicationFeeCents).toBe(1500); // comissão; a entrega foi subsidiada
  });
  it('o desconto da plataforma é limitado à application_fee inteira (comissão + entrega + serviço), nunca ao lojista', () => {
    const f = computeOrderFinance({ items: [{ subtotalCents: 5000, pctBp: 1000 }], storeCouponCents: 0, platformDiscountCents: 5000, deliveryFeeCents: 800, serviceFeeCents: 200 });
    expect(f).toMatchObject({ platformDiscountCents: 1500, platformDiscountCapped: true, applicationFeeCents: 0, merchantNetBeforeProviderFeeCents: 4500, totalCents: 5000 + 800 + 200 - 1500 });
  });
});

describe('comissão: precedência e categorias (RN-10, WB-105)', () => {
  const at = new Date('2026-06-01T12:00:00Z');
  const row = (pctBp: number | null, from: string, to: string | null = null) => ({ pctBp, startsAt: new Date(from), endsAt: to ? new Date(to) : null });
  it('loja > categoria > padrão', () => {
    expect(resolveCommission({ storeRates: [row(500, '2026-01-01')], categoryRates: [[row(800, '2026-01-01')]], defaultBp: 1000, at })).toEqual({ pctBp: 500, source: 'store' });
    expect(resolveCommission({ storeRates: [], categoryRates: [[row(800, '2026-01-01')]], defaultBp: 1000, at })).toEqual({ pctBp: 800, source: 'category' });
    expect(resolveCommission({ storeRates: [], categoryRates: [[]], defaultBp: 1000, at })).toEqual({ pctBp: 1000, source: 'default' });
  });
  it('fim da vigência volta sozinho à regra seguinte; início futuro ainda não vale', () => {
    expect(resolveCommission({ storeRates: [row(500, '2026-01-01', '2026-05-01')], categoryRates: [[row(800, '2026-01-01')]], defaultBp: 1000, at }).source).toBe('category');
    expect(resolveCommission({ storeRates: [row(500, '2026-07-01')], categoryRates: [], defaultBp: 1000, at }).source).toBe('default');
  });
  it('a linha mais recente em vigor vence; `null` remove o override sem apagar o histórico', () => {
    const rows = [row(500, '2026-01-01'), row(700, '2026-03-01')];
    expect(resolveCommission({ storeRates: rows, categoryRates: [], defaultBp: 1000, at }).pctBp).toBe(700);
    expect(resolveCommission({ storeRates: [...rows, row(null, '2026-05-01')], categoryRates: [[row(800, '2026-01-01')]], defaultBp: 1000, at })).toEqual({ pctBp: 800, source: 'category' });
  });
  it('categoria da subcategoria antes da mãe', () => {
    expect(resolveCommission({ storeRates: [], categoryRates: [[row(600, '2026-01-01')], [row(900, '2026-01-01')]], defaultBp: 1000, at }).pctBp).toBe(600);
    expect(resolveCommission({ storeRates: [], categoryRates: [[], [row(900, '2026-01-01')]], defaultBp: 1000, at }).pctBp).toBe(900);
  });
  it('itens de categorias diferentes somam a comissão de cada parte (WB-156 C6), com o cupom da loja rateado', () => {
    const f = computeOrderFinance({ items: [{ subtotalCents: 6000, pctBp: 1000 }, { subtotalCents: 4000, pctBp: 500 }], storeCouponCents: 1000, platformDiscountCents: 0, deliveryFeeCents: 0, serviceFeeCents: 0 });
    expect(f.items.map((i) => i.baseCents)).toEqual([5400, 3600]);
    expect(f.commissionCents).toBe(540 + 180);
  });
  it('arredondamento half-up: 10,5% de R$ 0,05 = 1 centavo (0,525 arredonda para cima)', () => {
    expect(applyBp(5, 1050)).toBe(1);
    expect(applyBp(4, 1050)).toBe(0);
  });
});

describe('cupom da plataforma limitado à comissão (DEC-016, SEC-060)', () => {
  it('desconto acima da comissão é cortado; application_fee nunca fica negativa', () => {
    const f = computeOrderFinance({ items: [{ subtotalCents: 5000, pctBp: 1000 }], storeCouponCents: 0, platformDiscountCents: 2000, deliveryFeeCents: 0, serviceFeeCents: 0 });
    expect(f).toMatchObject({ commissionCents: 500, platformDiscountCents: 500, platformDiscountCapped: true, applicationFeeCents: 0, totalCents: 4500 });
  });
  it('a taxa de serviço e a de entrega ampliam o teto: o desconto sai da application_fee inteira (RN-09)', () => {
    const f = computeOrderFinance({ items: [{ subtotalCents: 5000, pctBp: 1000 }], storeCouponCents: 0, platformDiscountCents: 700, deliveryFeeCents: 0, serviceFeeCents: 300 });
    expect(f.platformDiscountCents).toBe(700);
    expect(f.applicationFeeCents).toBe(100);
  });
  it('comissão zero (loja negociada) zera o desconto da plataforma', () => {
    const f = computeOrderFinance({ items: [{ subtotalCents: 5000, pctBp: 0 }], storeCouponCents: 0, platformDiscountCents: 300, deliveryFeeCents: 0, serviceFeeCents: 0 });
    expect(f).toMatchObject({ platformDiscountCents: 0, applicationFeeCents: 0 });
  });
});

describe('allocateProportional', () => {
  it('soma exata e determinística', () => {
    expect(allocateProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportional(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProportional(7, [0, 0])).toEqual([0, 0]);
  });
});

describe('propriedades do ledger (SEC-041, WB-156 C4), 3000 pedidos aleatórios', () => {
  const randomInput = (r: () => number): OrderFinanceInput => {
    const items = Array.from({ length: int(r, 1, 5) }, () => ({ subtotalCents: int(r, 1, 500_000), pctBp: int(r, 0, 3000) }));
    const subtotal = items.reduce((s, i) => s + i.subtotalCents, 0);
    return { items, storeCouponCents: r() < 0.4 ? int(r, 0, subtotal) : 0, platformDiscountCents: r() < 0.4 ? int(r, 0, subtotal) : 0, deliveryFeeCents: int(r, 0, 5000), serviceFeeCents: r() < 0.5 ? int(r, 0, 1000) : 0 };
  };

  it('toda venda fecha; total = bruto - cupom da plataforma + taxa; receita Webag >= 0 e igual à application_fee', () => {
    const r = rng(42);
    for (let n = 0; n < 3000; n++) {
      const f = computeOrderFinance(randomInput(r));
      const lines = saleLines(f);
      expect(isBalanced(lines)).toBe(true);
      expect(f.totalCents).toBe(f.merchantGrossCents - f.platformDiscountCents + f.serviceFeeCents + f.deliveryFeeCents);
      expect(f.applicationFeeCents).toBeGreaterThanOrEqual(0);
      expect(f.platformDiscountCents).toBeLessThanOrEqual(f.commissionCents + f.deliveryFeeCents + f.serviceFeeCents);
      expect(f.commissionCents).toBe(f.items.reduce((s, i) => s + i.commissionCents, 0));
      expect(f.items.reduce((s, i) => s + i.baseCents, 0)).toBe(f.baseCents);
      // a conta da loja: líquido = total + cupom da plataforma - taxa de serviço - entrega - comissão (= itens - cupom da loja - comissão)
      expect(f.merchantNetBeforeProviderFeeCents).toBe(f.totalCents + f.platformDiscountCents - f.serviceFeeCents - f.deliveryFeeCents - f.commissionCents);
      expect(-accountBalance(lines, 'merchant_payable')).toBe(f.merchantNetBeforeProviderFeeCents);
      expect(accountBalance(lines, 'provider_clearing')).toBe(f.totalCents);
    }
  });

  it('qualquer sequência de estornos parciais fecha cada lançamento e o saldo do pedido = pago - estornado - tarifa', () => {
    const r = rng(7);
    for (let n = 0; n < 3000; n++) {
      const f = computeOrderFinance(randomInput(r));
      if (f.totalCents < 2) continue;
      const fee = int(r, 0, Math.min(f.merchantNetBeforeProviderFeeCents, 3000));
      const all: LedgerLine[] = [...saleLines(f), ...providerFeeLines(fee)];
      let refunded = 0;
      while (refunded < f.totalCents && r() < 0.8) {
        const part = r() < 0.3 ? f.totalCents - refunded : int(r, 1, f.totalCents - refunded);
        const lines = refundLines(f, refunded, part);
        expect(isBalanced(lines)).toBe(true);
        all.push(...lines);
        refunded += part;
        expect(accountBalance(all, 'provider_clearing')).toBe(f.totalCents - refunded - fee);
      }
      expect(isBalanced(all)).toBe(true);
      if (refunded === f.totalCents) {
        // estorno total devolve comissão, taxa de serviço e desconto: a Webag zera; a loja só fica com a tarifa (negativa)
        expect(accountBalance(all, 'commission_revenue')).toBe(0);
        expect(accountBalance(all, 'service_fee_revenue')).toBe(0);
        expect(accountBalance(all, 'platform_promo_expense')).toBe(0);
        expect(-accountBalance(all, 'merchant_payable')).toBe(-fee);
      }
    }
  });

  it('estorno acima do pago é recusado', () => {
    const f = computeOrderFinance({ items: [{ subtotalCents: 1000, pctBp: 1000 }], storeCouponCents: 0, platformDiscountCents: 0, deliveryFeeCents: 0, serviceFeeCents: 0 });
    expect(() => refundLines(f, 600, 401)).toThrow();
    expect(() => refundLines(f, 0, 0)).toThrow();
  });
});
