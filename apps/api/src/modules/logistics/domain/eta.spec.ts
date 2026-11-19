import { computeEta, etaWindow, maxDistanceForCeilingM, type EtaConfig } from './eta.js';

const config: EtaConfig = { defaultPrepMin: 20, dispatchMin: 15, routeFactorPct: 130, minPerKm: 6, bandMin: 15, maxMin: 120 };

describe('ETA (DEC-053)', () => {
  it('soma preparo + despacho + deslocamento e abre a faixa de 15 min para cada lado', () => {
    // 5 km x 1,3 x 6 = 39 min; 20 + 15 + 39 = 74
    const eta = computeEta(config, { distanceM: 5000 });
    expect(eta).toMatchObject({ prepMin: 20, dispatchMin: 15, travelMin: 39, estimateMin: 74, fromMin: 59, toMin: 89, withinCeiling: true });
  });

  it('o preparo da loja substitui o padrão', () => {
    expect(computeEta(config, { distanceM: 5000, prepMin: 40 }).estimateMin).toBe(94);
  });

  it('DEC-054: o teto vale para o FIM da faixa e é inclusivo (fim em 119 e 120 entrega; 121 não)', () => {
    // 5 min/km sem fator de rota: fim da faixa = 20 + 15 + km x 5 + 15 = 50 + km x 5
    const flat = { ...config, minPerKm: 5, routeFactorPct: 100 };
    const at119 = computeEta(flat, { distanceM: 13_800 }); // 69 min de deslocamento
    expect(at119).toMatchObject({ estimateMin: 104, toMin: 119, withinCeiling: true });
    const at120 = computeEta(flat, { distanceM: 14_000 }); // 70
    expect(at120).toMatchObject({ estimateMin: 105, toMin: 120, withinCeiling: true });
    const at121 = computeEta(flat, { distanceM: 14_001 }); // 71 (arredonda para cima)
    expect(at121).toMatchObject({ estimateMin: 106, toMin: 121, withinCeiling: false });
  });

  it('DEC-054: alcance padrão cai para ~9 km; a loja a 10,5 km não mostra mais faixa de 102 a 132 min', () => {
    const maxM = maxDistanceForCeilingM(config, null); // sobra 120 - 15 - 20 - 15 = 70 min; 7,8 min/km => 8,97 km
    expect(maxM).toBeGreaterThan(8_900);
    expect(maxM).toBeLessThan(9_000);
    expect(computeEta(config, { distanceM: maxM }).withinCeiling).toBe(true);
    expect(computeEta(config, { distanceM: maxM }).toMin).toBeLessThanOrEqual(120);
    expect(computeEta(config, { distanceM: maxM + 200 }).withinCeiling).toBe(false);
    const far = computeEta(config, { distanceM: 10_500 }); // 82 min de deslocamento: faixa 102 a 132
    expect(far).toMatchObject({ fromMin: 102, toMin: 132, withinCeiling: false });
  });

  it('a folga da faixa entra no alcance: folga maior, alcance menor', () => {
    expect(maxDistanceForCeilingM({ ...config, bandMin: 30 }, null)).toBeLessThan(maxDistanceForCeilingM(config, null));
  });

  it('a faixa nunca começa antes de 5 min', () => {
    expect(computeEta({ ...config, defaultPrepMin: 1, dispatchMin: 1 }, { distanceM: 0 }).fromMin).toBe(5);
  });

  it('preparo que já estoura o teto não tem distância possível', () => {
    expect(maxDistanceForCeilingM(config, 110)).toBe(0);
    expect(maxDistanceForCeilingM(config, 90)).toBe(0); // 90 + 15 + 15 = 120: sem folga para rodar
  });

  it('janela em horário de relógio', () => {
    const w = etaWindow({ fromMin: 60, toMin: 90 }, new Date('2026-11-19T15:00:00Z'));
    expect(w.fromAt.toISOString()).toBe('2026-11-19T16:00:00.000Z');
    expect(w.toAt.toISOString()).toBe('2026-11-19T16:30:00.000Z');
  });
});
