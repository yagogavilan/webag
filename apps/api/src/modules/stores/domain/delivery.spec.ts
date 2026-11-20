import { applyFreeShipping, deliveryFee, haversineM, validateFreeAbove, validateTiers, type FeeConfig, type Tier } from './delivery.js';

const tiers: Tier[] = [
  { fromM: 0, toM: 2000, feeCents: 500 },
  { fromM: 2000, toM: 5000, feeCents: 900 },
];
const config: FeeConfig = { mode: 'by_distance', fixedCents: 0, tiers, radiusM: 5000 };

describe('faixas de taxa (RN-04, R-17, O2-ENT-03/04)', () => {
  it('5 faixas contíguas passam; lacuna, sobreposição, 6 faixas e última faixa fora do raio falham', () => {
    expect(validateTiers(tiers, 5000)).toBeNull();
    const five: Tier[] = [0, 1, 2, 3, 4].map((i) => ({ fromM: i * 1000, toM: (i + 1) * 1000, feeCents: 100 + i }));
    expect(validateTiers(five, 5000)).toBeNull();
    expect(validateTiers([...five, { fromM: 5000, toM: 6000, feeCents: 1 }], 6000)).toMatch(/1 a 5/);
    expect(validateTiers([{ fromM: 0, toM: 2000, feeCents: 1 }, { fromM: 3000, toM: 5000, feeCents: 1 }], 5000)).toBe('As faixas precisam ser seguidas');
    expect(validateTiers([{ fromM: 0, toM: 3000, feeCents: 1 }, { fromM: 2000, toM: 5000, feeCents: 1 }], 5000)).toBe('As faixas precisam ser seguidas');
    expect(validateTiers(tiers, 6000)).toMatch(/terminar no raio/);
    expect(validateTiers([{ fromM: 500, toM: 5000, feeCents: 1 }], 5000)).toMatch(/começar em 0/);
    expect(validateTiers([{ fromM: 0, toM: 5000, feeCents: 5001 }], 5000)).toMatch(/R\$ 50,00/);
  });

  it('deliveryFee: 0 m, fronteira 2.000 m cai na faixa SEGUINTE, 4.999 m, exatamente o raio (inclui), 1 m acima (fora)', () => {
    expect(deliveryFee(config, 0)).toBe(500);
    expect(deliveryFee(config, 1999)).toBe(500);
    expect(deliveryFee(config, 2000)).toBe(900);
    expect(deliveryFee(config, 4999)).toBe(900);
    expect(deliveryFee(config, 5000)).toBe(900);
    expect(deliveryFee(config, 5001)).toBeNull();
  });

  it('taxa fixa respeita o raio', () => {
    expect(deliveryFee({ mode: 'fixed', fixedCents: 700, tiers: [], radiusM: 3000 }, 3000)).toBe(700);
    expect(deliveryFee({ mode: 'fixed', fixedCents: 700, tiers: [], radiusM: 3000 }, 3001)).toBeNull();
  });
});

describe('frete grátis e pedido mínimo (RN-04, O2-ENT-06)', () => {
  it('X precisa ser estritamente maior que o mínimo; 0 desliga', () => {
    expect(validateFreeAbove(0, 5000)).toBeNull();
    expect(validateFreeAbove(5001, 5000)).toBeNull();
    expect(validateFreeAbove(5000, 5000)).not.toBeNull();
    expect(validateFreeAbove(100, 0)).toBeNull();
  });

  it('subtotal = X → frete 0; X - 1 centavo → frete cobrado; sem X nunca é grátis', () => {
    expect(applyFreeShipping(900, 10_000, 10_000)).toBe(0);
    expect(applyFreeShipping(900, 9_999, 10_000)).toBe(900);
    expect(applyFreeShipping(900, 1_000_000, 0)).toBe(900);
  });
});

describe('haversine (referência independente do PostGIS)', () => {
  it('Francisco Morato -> Franco da Rocha ~ 5 km', () => {
    const d = haversineM({ lat: -23.2811, lng: -46.7452 }, { lat: -23.3216, lng: -46.7263 });
    expect(d).toBeGreaterThan(4500);
    expect(d).toBeLessThan(5500);
  });
});
