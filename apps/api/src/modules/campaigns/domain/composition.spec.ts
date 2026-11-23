import { composeDiscount, minSubtotalForSelfFunded, shortfallCents, type CompositionOrder, type CompositionRule } from './composition.js';

const order = (over: Partial<CompositionOrder> & { subtotalCents: number }): CompositionOrder => ({
  deliveryFeeCents: 600,
  serviceFeeOf: () => 0,
  commissionOf: (subtotal, store) => Math.floor(((subtotal - store) * 1500 * 2 + 10_000) / 20_000), // 15%
  courierCostCents: 500,
  autofinTetoPct: 50,
  minTotalCents: 100,
  ...over,
});
const rule = (over: Partial<CompositionRule>): CompositionRule => ({ funding: 'webag', storeSharePct: 0, kind: 'fixed', value: 800, percentCapCents: null, ...over });

describe('composição do desconto (RN-C1 a C3, DEC-088)', () => {
  it('Webag paga: o desconto fixo sai inteiro da Webag e o total é subtotal - desconto + entrega + serviço', () => {
    const r = composeDiscount(rule({}), order({ subtotalCents: 8000 }));
    expect(r).toMatchObject({ ok: true, grossCents: 800, storeCents: 0, webagCents: 800, totalCents: 8000 - 800 + 600 });
  });

  it('Dividido: 40% da loja com round_half_up e o resto da Webag; a soma é sempre o bruto', () => {
    const r = composeDiscount(rule({ funding: 'split', storeSharePct: 40, kind: 'percent', value: 10, percentCapCents: 1000 }), order({ subtotalCents: 8333 }));
    // 10% de 83,33 = 833 (half up); loja 40% = 333 (333,2), Webag 500
    expect(r).toMatchObject({ ok: true, grossCents: 833, storeCents: 333, webagCents: 500 });
  });

  it('Loja paga: 100% da loja e nada da Webag; a comissão cai porque a base diminui (RN-10)', () => {
    const sem = composeDiscount(rule({ funding: 'store', storeSharePct: 100 }), order({ subtotalCents: 8000 }));
    expect(sem).toMatchObject({ ok: true, storeCents: 800, webagCents: 0 });
    if (sem.ok) expect(sem.applicationFeeCents).toBe(Math.floor((7200 * 1500 * 2 + 10_000) / 20_000) + 600);
  });

  it('RN-09: o desconto da Webag nunca passa da application_fee (comissão + entrega + serviço) e o corte é registrado', () => {
    const r = composeDiscount(rule({ value: 5000 }), order({ subtotalCents: 8000 })); // fee = 1200 + 600 = 1800
    expect(r).toMatchObject({ ok: true, webagCents: 1800, webagCutCents: 3200, applicationFeeCents: 1800 });
  });

  it('frete grátis: o desconto é a entrega cheia (nunca "Grátis"); o frete cobrado segue o mesmo', () => {
    const r = composeDiscount(rule({ kind: 'free_shipping', value: 0 }), order({ subtotalCents: 8000 }));
    expect(r).toMatchObject({ ok: true, grossCents: 600, webagCents: 600, totalCents: 8000 });
  });

  it('total mínimo: corta primeiro a parte da Webag e depois a da loja', () => {
    const r = composeDiscount(rule({ funding: 'split', storeSharePct: 50, kind: 'fixed', value: 3000 }), order({ subtotalCents: 3000, deliveryFeeCents: 0, minTotalCents: 2000 }));
    // bruto 3000 = loja 1500 + Webag 1500, a Webag já cortada na application_fee (225); total 1275 < 2000: falta 725 = 225 da Webag e 500 da loja
    expect(r).toMatchObject({ ok: true, minimumTotalApplied: true, totalCents: 2000, webagCents: 0, storeCents: 1000 });
  });

  it('autofinanciado: com margem 1300 e teto 50% o desconto de R$ 8,00 não cabe (650); R$ 6,00 cabe', () => {
    expect(composeDiscount(rule({ funding: 'self_funded', value: 800 }), order({ subtotalCents: 8000 }))).toMatchObject({ ok: false, reason: 'SHORTFALL' });
    expect(composeDiscount(rule({ funding: 'self_funded', value: 600 }), order({ subtotalCents: 8000 }))).toMatchObject({ ok: true, webagCents: 600 });
    expect(composeDiscount(rule({ funding: 'self_funded', value: 100 }), order({ subtotalCents: 8000, courierCostCents: 5000 }))).toMatchObject({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('autofinanciado nunca é reduzido pelo total mínimo (R11): recusa em vez de cortar', () => {
    const r = composeDiscount(rule({ funding: 'self_funded', value: 100 }), order({ subtotalCents: 150, deliveryFeeCents: 0, courierCostCents: 0, commissionOf: () => 500, minTotalCents: 100 }));
    expect(r).toMatchObject({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('"Faltam R$ X": o menor subtotal viável, com s* viável e s*-1 inviável, e pelo menos R$ 0,01', () => {
    const base = order({ subtotalCents: 1 });
    const { subtotalCents: _unused, ...rest } = base;
    void _unused;
    const r = rule({ funding: 'self_funded', kind: 'fixed', value: 800 });
    const s = minSubtotalForSelfFunded(r, rest, 0);
    expect(s).not.toBeNull();
    expect(composeDiscount(r, { ...rest, subtotalCents: s! }).ok).toBe(true);
    expect(composeDiscount(r, { ...rest, subtotalCents: s! - 1 }).ok).toBe(false);
    expect(shortfallCents(s!, s! - 1)).toBe(1);
    expect(shortfallCents(s!, s! + 50)).toBe(1);
  });

  it('R12: percentual autofinanciado SEM teto acima da margem piora com a compra: o "Faltam" vira "não disponível" (null), nunca um número errado', () => {
    const base = order({ subtotalCents: 1 });
    const { subtotalCents: _unused, ...rest } = base;
    void _unused;
    expect(minSubtotalForSelfFunded(rule({ funding: 'self_funded', kind: 'percent', value: 60 }), { ...rest, courierCostCents: 0 }, 0, 8000)).toBeNull();
  });

  it('propriedade (RN-C1, DEC-088): em 10 mil sacolas, subtotal, entrega e serviço ficam iguais; total = soma - desconto; application_fee nunca negativa; autofinanciado nunca com margem negativa', () => {
    let seed = 42;
    const rand = (max: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    const fundings = ['webag', 'store', 'split', 'self_funded'] as const;
    const kinds = ['percent', 'fixed', 'free_shipping'] as const;
    let composed = 0;
    for (let i = 0; i < 10_000; i++) {
      const funding = fundings[rand(4)]!;
      let kind = kinds[rand(3)]!;
      if (kind === 'free_shipping' && (funding === 'store' || funding === 'split')) kind = 'fixed';
      const share = funding === 'store' ? 100 : funding === 'split' ? 1 + rand(99) : 0;
      const subtotal = 500 + rand(60_000);
      const delivery = rand(1500);
      const o = order({ subtotalCents: subtotal, deliveryFeeCents: delivery, courierCostCents: rand(1200), serviceFeeOf: (s) => Math.floor((s * 200) / 10_000) });
      const r = composeDiscount({ funding, storeSharePct: share, kind, value: kind === 'percent' ? 1 + rand(100) : kind === 'fixed' ? 1 + rand(5000) : 0, percentCapCents: rand(2) === 0 ? null : 1 + rand(3000) }, o);
      if (!r.ok) continue;
      composed += 1;
      const service = o.serviceFeeOf(subtotal);
      expect(r.totalCents).toBe(subtotal + delivery + service - r.storeCents - r.webagCents);
      expect(r.storeCents + r.webagCents).toBeLessThanOrEqual(kind === 'free_shipping' ? delivery : subtotal);
      expect(r.totalCents).toBeGreaterThanOrEqual(Math.min(o.minTotalCents, subtotal + delivery + service));
      if (funding !== 'self_funded') expect(r.applicationFeeCents - r.webagCents).toBeGreaterThanOrEqual(0);
      if (funding === 'self_funded') expect(r.remainingCents).toBeGreaterThanOrEqual(0);
    }
    expect(composed).toBeGreaterThan(3000);
  });
});
