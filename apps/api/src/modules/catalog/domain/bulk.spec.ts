import { adjustByBp, adjustPriceCents, changePct, percentToBp } from './bulk.js';

describe('reajuste de preço em inteiro (A3)', () => {
  it.each([
    [10, 1000],
    [5.5, 550],
    [-0.25, -25],
    [0.01, 1],
    [500, 50_000],
    [-90, -9000],
    [33.33, 3333],
  ])('percentToBp(%f) = %i', (value, bp) => expect(percentToBp(value)).toBe(bp));

  it.each([501, -91, 0.001, 10.005, Number.NaN, Number.POSITIVE_INFINITY])('percentToBp(%f) recusa (fora da faixa ou mais de 2 casas)', (value) => expect(percentToBp(value)).toBeNull());

  it.each([
    [4_990, 1000, 5_489], // 5489,0
    [999, 1000, 1_099], // 1098,9 sobe
    [1_005, 1000, 1_106], // 1105,5: meio para cima
    [1_001, -1000, 901], // 900,9
    [5, -1000, 5], // 4,5: meio para cima
    [1, -9000, 0], // 0,1 -> 0 (o item é bloqueado acima: fora da faixa)
    [9_999_999, 50_000, 59_999_994],
  ])('adjustByBp(%i, %i) = %i', (cents, bp, expected) => expect(adjustByBp(cents, bp)).toBe(expected));

  it('+10% duas vezes dá +21%, nunca +10%: é por isso que a repetição precisa de chave e versão', () => {
    const once = adjustByBp(10_000, 1000);
    expect(adjustByBp(once, 1000)).toBe(12_100);
  });

  it('em reais soma centavos inteiros (positivo ou negativo)', () => {
    expect(adjustPriceCents(1_000, { mode: 'amount', cents: 500 })).toBe(1_500);
    expect(adjustPriceCents(1_000, { mode: 'amount', cents: -999 })).toBe(1);
    expect(adjustPriceCents(1_000, { mode: 'percent', bp: -500 })).toBe(950);
  });

  it('variação para a prévia, 1 casa', () => {
    expect(changePct(4_990, 499)).toBe(-90);
    expect(changePct(10_000, 10_333)).toBe(3.3);
    expect(changePct(0, 100)).toBe(0);
  });
});
