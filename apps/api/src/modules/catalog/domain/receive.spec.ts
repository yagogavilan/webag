import { pctToBp, youReceiveCents } from './receive.js';

describe('"Você recebe" no servidor (DEC-035)', () => {
  it.each([
    [10_000, 15, 4.98, 10_000 - 1_500 - 498],
    [4_990, 15, 0, 4_990 - 749], // 748,5 arredonda para 749
    [1, 15, 4.98, 1], // 0,15 e 0,05 arredondam para 0
    [9_999_999, 30, 15, 9_999_999 - 3_000_000 - 1_500_000],
    [5_000, 0, 0.99, 5_000 - 50],
  ])('preço %i, comissão %f%%, tarifa %f%% -> %i', (price, commission, fee, expected) => {
    expect(youReceiveCents(price, pctToBp(commission), pctToBp(fee))).toBe(expected);
  });
});
