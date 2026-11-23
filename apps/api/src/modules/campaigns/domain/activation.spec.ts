import { checkActivation, simulateBands, worstCaseWebag, type ActivationContext, type BandInput, type CampaignFacts } from './activation.js';

const bands: BandInput[] = [
  { id: 'pickup', label: 'Retirada', fromM: null, toM: null, pickup: true, deliveryFeeCents: 0, courierCostCents: 0 },
  { id: 'tier-1', label: 'Até 2 km', fromM: 0, toM: 2000, pickup: false, deliveryFeeCents: 600, courierCostCents: 500 },
  { id: 'tier-2', label: '2 a 4 km', fromM: 2000, toM: 4000, pickup: false, deliveryFeeCents: 900, courierCostCents: 1100 },
];
const ctx = (over: Partial<ActivationContext> = {}): ActivationContext => ({ freeShippingEnabled: false, storeShareEnabled: false, monthlyBudgetCents: 100_000, committedCents: 0, acceptedStores: 0, autofinTetoPct: 50, minTotalCents: 100, referenceCommissionPct: 15, serviceFeeOf: () => 0, bands, ...over });
const facts = (over: Partial<CampaignFacts> = {}): CampaignFacts => ({ name: 'Campanha', owner: 'webag', funding: 'webag', storeSharePct: 0, kind: 'fixed', value: 300, percentCapCents: null, minOrderCents: 0, startsAt: null, endsAt: null, budgetTotalCents: 5_000, budgetDailyCents: 2_000, maxUses: 10, ...over });
const codes = (f: CampaignFacts, c: ActivationContext) => checkActivation(f, c).blockers.map((b) => b.code);

describe('conferências de ativação (WB-340 C1 a C11)', () => {
  it('campanha "Webag paga" completa, com orçamento global, não tem blocker e exige 2º fator', () => {
    const v = checkActivation(facts(), ctx());
    expect(v.blockers).toEqual([]);
    expect(v).toMatchObject({ requiresStepUp: true, requiresSuperAdmin: false, maxCostCents: 5_000 });
  });

  it('F2: orçamento mensal global em R$ 0 bloqueia toda fonte com custo da Webag, e a "Loja paga" não é afetada por ele', () => {
    expect(codes(facts(), ctx({ monthlyBudgetCents: 0 }))).toContain('GLOBAL_BUDGET_ZERO');
    expect(codes(facts({ funding: 'self_funded' }), ctx({ monthlyBudgetCents: 0 }))).toContain('GLOBAL_BUDGET_ZERO');
    const store = codes(facts({ funding: 'store', storeSharePct: 100, budgetTotalCents: null, budgetDailyCents: null }), ctx({ monthlyBudgetCents: 0, storeShareEnabled: true, acceptedStores: 1 }));
    expect(store).not.toContain('GLOBAL_BUDGET_ZERO');
  });

  it('C11: o orçamento da campanha não passa do que resta do global, e diz quanto falta', () => {
    const blocker = checkActivation(facts({ budgetTotalCents: 90_000 }), ctx({ committedCents: 20_000 })).blockers.find((b) => b.code === 'GLOBAL_BUDGET_EXCEEDED');
    expect(blocker?.missingCents).toBe(10_000);
  });

  it('exige orçamento total e diário (C4), limite de usos ou orçamento (C6), teto no percentual com custo da Webag, e as flags jurídicas', () => {
    expect(codes(facts({ budgetTotalCents: null, budgetDailyCents: null, maxUses: null }), ctx())).toEqual(expect.arrayContaining(['BUDGET_REQUIRED', 'USAGE_OR_BUDGET_REQUIRED']));
    expect(codes(facts({ kind: 'percent', value: 10 }), ctx())).toContain('PERCENT_CAP_REQUIRED');
    expect(codes(facts({ kind: 'free_shipping', value: 0 }), ctx())).toContain('FREE_SHIPPING_DISABLED');
    expect(codes(facts({ kind: 'free_shipping', value: 0 }), ctx({ freeShippingEnabled: true }))).not.toContain('FREE_SHIPPING_DISABLED');
    expect(codes(facts({ funding: 'split', storeSharePct: 40, kind: 'percent', value: 10, percentCapCents: 500 }), ctx())).toEqual(expect.arrayContaining(['STORE_SHARE_DISABLED', 'NO_ACCEPTED_STORE']));
  });

  it('C5: "Webag paga" acima da margem prevista em alguma faixa só o super admin ativa (a retirada tem margem 0)', () => {
    const v = checkActivation(facts({ value: 800 }), ctx());
    expect(v.aboveMargin).toBe(true);
    expect(v.requiresSuperAdmin).toBe(true);
    expect(v.blockers.map((b) => b.code)).toContain('ABOVE_MARGIN_SUPER_ADMIN_ONLY');
  });

  it('C1: autofinanciado precisa de pedido mínimo que caiba na margem de todas as faixas, e a conta devolve o necessário', () => {
    const v = checkActivation(facts({ funding: 'self_funded', value: 400, minOrderCents: 0 }), ctx());
    const blocker = v.blockers.find((b) => b.code === 'MIN_ORDER_TOO_LOW');
    expect(blocker?.requiredMinOrderCents).toBeGreaterThan(0);
    expect(codes(facts({ funding: 'self_funded', value: 400, minOrderCents: blocker!.requiredMinOrderCents! }), ctx())).not.toContain('MIN_ORDER_TOO_LOW');
  });

  it('a simulação cobre a retirada e cada faixa, nunca devolve desconto negativo e marca prejuízo em texto (remaining < 0)', () => {
    const sim = simulateBands(facts({ value: 800 }), ctx());
    expect(sim.rows.map((r) => r.band.id)).toEqual(['pickup', 'tier-1', 'tier-2']);
    expect(sim.rows.every((r) => r.discountWebagCents >= 0 && r.discountStoreCents >= 0)).toBe(true);
    expect(sim.rows[2]!.remainingCents).toBeLessThan(0); // faixa 2: margem 900 + comissão - 1.100 de motoboy
  });

  it('pior caso: percentual com teto = o teto; fixo = o valor; frete = a maior entrega; Loja paga = 0', () => {
    expect(worstCaseWebag({ funding: 'webag', storeSharePct: 0, kind: 'percent', value: 20, percentCapCents: 1_500 }, bands).webagCents).toBe(1_500);
    expect(worstCaseWebag({ funding: 'webag', storeSharePct: 0, kind: 'fixed', value: 700, percentCapCents: null }, bands).webagCents).toBe(700);
    expect(worstCaseWebag({ funding: 'webag', storeSharePct: 0, kind: 'free_shipping', value: 0, percentCapCents: null }, bands).webagCents).toBe(900);
    expect(worstCaseWebag({ funding: 'store', storeSharePct: 100, kind: 'fixed', value: 700, percentCapCents: null }, bands).webagCents).toBe(0);
    expect(worstCaseWebag({ funding: 'split', storeSharePct: 40, kind: 'fixed', value: 1_000, percentCapCents: null }, bands).webagCents).toBe(600);
  });
});
