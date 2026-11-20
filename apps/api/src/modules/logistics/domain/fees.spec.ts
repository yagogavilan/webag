import { applyFreeShipping, defaultExchangeFee, pickTier, startingFee, validateFeeTiers, validateFreeAbove, type FeeTier } from './fees.js';

const tier = (fromM: number, toM: number, feeCents: number, over: Partial<FeeTier> = {}): FeeTier => ({ fromM, toM, feeCents, exchangeFeeCents: defaultExchangeFee(feeCents), expectedCostCents: 0, etaMinutes: 10, ...over });
const TABLE = [tier(0, 2_000, 600), tier(2_000, 5_000, 900), tier(5_000, 10_000, 1_200), tier(10_000, 15_000, 1_500)];

describe('tabela de taxa de entrega (WB-236, RN-04)', () => {
  it('o limite superior pertence à faixa seguinte: 2,00 km cai em 2-5; a última faixa inclui o raio', () => {
    expect(pickTier(TABLE, 0)?.tier.feeCents).toBe(600);
    expect(pickTier(TABLE, 1_999)?.tier.feeCents).toBe(600);
    expect(pickTier(TABLE, 2_000)?.tier.feeCents).toBe(900);
    expect(pickTier(TABLE, 14_999)?.tier.feeCents).toBe(1_500);
    expect(pickTier(TABLE, 15_000)).toMatchObject({ position: 3, tier: { feeCents: 1_500 } });
    expect(pickTier(TABLE, 15_001)).toBeNull();
  });

  it('valida faixas: começa em 0, contíguas, última no raio, teto da taxa e da taxa de troca, até 6 faixas', () => {
    expect(validateFeeTiers(TABLE, 15_000, 3_000)).toBeNull();
    expect(validateFeeTiers([], 15_000, 3_000)).toMatch(/1 a 6/);
    expect(validateFeeTiers([tier(0, 1_000, 500), tier(1_000, 2_000, 500), tier(2_000, 3_000, 500), tier(3_000, 4_000, 500), tier(4_000, 5_000, 500), tier(5_000, 6_000, 500), tier(6_000, 15_000, 500)], 15_000, 3_000)).toMatch(/1 a 6/);
    expect(validateFeeTiers([tier(500, 15_000, 500)], 15_000, 3_000)).toMatch(/começar em 0/);
    expect(validateFeeTiers([tier(0, 2_000, 600), tier(2_500, 15_000, 900)], 15_000, 3_000)).toMatch(/seguidas/);
    expect(validateFeeTiers([tier(0, 2_000, 600), tier(1_500, 15_000, 900)], 15_000, 3_000)).toMatch(/seguidas/);
    expect(validateFeeTiers([tier(0, 10_000, 600)], 15_000, 3_000)).toMatch(/terminar no raio/);
    expect(validateFeeTiers([tier(0, 15_000, 5_001)], 15_000, 3_000)).toMatch(/R\$ 50,00/);
    expect(validateFeeTiers([tier(0, 15_000, 900, { exchangeFeeCents: 3_001 })], 15_000, 3_000)).toMatch(/taxa de troca vai até R\$ 30,00/);
    expect(validateFeeTiers([tier(0, 15_000, 900, { feeCents: 9.5 })], 15_000, 3_000)).toMatch(/inválidos/);
  });

  it('taxa de troca padrão = 50% da entrega, arredondado para cima (DEC-039a)', () => {
    expect(defaultExchangeFee(800)).toBe(400);
    expect(defaultExchangeFee(899)).toBe(450);
    expect(defaultExchangeFee(0)).toBe(0);
  });

  it('frete grátis acima de X compara o subtotal; X = 0 desliga; X precisa passar do mínimo', () => {
    expect(applyFreeShipping(800, 14_999, 15_000)).toBe(800);
    expect(applyFreeShipping(800, 15_000, 15_000)).toBe(0);
    expect(applyFreeShipping(800, 99_999, 0)).toBe(800);
    expect(validateFreeAbove(2_000, 2_000)).toMatch(/maior que o pedido mínimo/);
    expect(validateFreeAbove(2_001, 2_000)).toBeNull();
    expect(validateFreeAbove(0, 2_000)).toBeNull();
  });

  it('"a partir de" é a menor taxa da tabela', () => {
    expect(startingFee(TABLE)).toBe(600);
    expect(startingFee([])).toBeNull();
  });
});
