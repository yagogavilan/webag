import { describe, expect, it } from 'vitest';
import { commissionCents, priceToReceive, worstProviderFeePct, youReceive } from './receive';

describe('"Você recebe" (RN-10, DEC-035)', () => {
  it('preço menos comissão, com arredondamento para o centavo mais próximo', () => {
    expect(youReceive(10000, 15)).toEqual({ commission: 1500, fee: 0, receive: 8500 });
    expect(youReceive(9990, 15)).toEqual({ commission: 1499, fee: 0, receive: 8491 }); // 1498,5 sobe
    expect(commissionCents(0, 15)).toBe(0);
  });
  it('"Quero receber um valor" nunca deixa a loja receber menos que o pedido', () => {
    for (const wanted of [10000, 8491, 3333, 1]) {
      for (const pct of [0, 8.5, 10, 15, 30]) {
        const price = priceToReceive(wanted, pct);
        expect(youReceive(price, pct).receive).toBeGreaterThanOrEqual(wanted);
        expect(youReceive(price - 1, pct).receive).toBeLessThan(wanted);
      }
    }
    expect(priceToReceive(10000, 15)).toBe(11765);
  });

  it('tarifa do provedor: desconta a do meio mais caro e "Quero receber" a inclui', () => {
    expect(worstProviderFeePct({ pix: 0.99, card: 4.98 })).toBe(4.98);
    expect(worstProviderFeePct(null)).toBe(0);
    expect(youReceive(10000, 15, 4.98)).toEqual({ commission: 1500, fee: 498, receive: 8002 });
    expect(youReceive(10000, 15)).toEqual({ commission: 1500, fee: 0, receive: 8500 });
    for (const wanted of [10000, 8491, 3333, 1]) {
      const price = priceToReceive(wanted, 15, 4.98);
      expect(youReceive(price, 15, 4.98).receive).toBeGreaterThanOrEqual(wanted);
      expect(youReceive(price - 1, 15, 4.98).receive).toBeLessThan(wanted);
    }
  });
});
