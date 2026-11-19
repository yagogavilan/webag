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

  it('o teto de 120 min é inclusivo: 120 entrega, 121 não', () => {
    const maxM = maxDistanceForCeilingM(config, null); // room = 85 min; 7,8 min/km => 10,897 km
    expect(computeEta(config, { distanceM: maxM }).withinCeiling).toBe(true);
    expect(computeEta(config, { distanceM: maxM }).estimateMin).toBeLessThanOrEqual(120);
    expect(computeEta(config, { distanceM: maxM + 200 }).withinCeiling).toBe(false);
    // exatamente 120: 20 + 15 + 85 (10,8974 km) => use 85 min de deslocamento
    const edge = computeEta({ ...config, minPerKm: 5, routeFactorPct: 100 }, { distanceM: 17000 });
    expect(edge.estimateMin).toBe(120);
    expect(edge.withinCeiling).toBe(true);
    expect(computeEta({ ...config, minPerKm: 5, routeFactorPct: 100 }, { distanceM: 17001 }).withinCeiling).toBe(false);
  });

  it('a faixa nunca começa antes de 5 min', () => {
    expect(computeEta({ ...config, defaultPrepMin: 1, dispatchMin: 1 }, { distanceM: 0 }).fromMin).toBe(5);
  });

  it('preparo que já estoura o teto não tem distância possível', () => {
    expect(maxDistanceForCeilingM(config, 110)).toBe(0);
  });

  it('janela em horário de relógio', () => {
    const w = etaWindow({ fromMin: 60, toMin: 90 }, new Date('2026-11-19T15:00:00Z'));
    expect(w.fromAt.toISOString()).toBe('2026-11-19T16:00:00.000Z');
    expect(w.toAt.toISOString()).toBe('2026-11-19T16:30:00.000Z');
  });
});
