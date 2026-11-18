/**
 * Entrega e frete (RN-04, WB-057, R-17). Distâncias em METROS inteiros: as fronteiras de faixa são exatas.
 * Faixa = `[from, to)`: o limite superior pertence à faixa seguinte; a ÚLTIMA faixa inclui o raio.
 */
export interface Tier {
  fromM: number;
  toM: number;
  feeCents: number;
}

export const MAX_TIERS = 5;
export const MAX_FIXED_FEE_CENTS = 5000;

export type FeeMode = 'fixed' | 'by_distance';

export function validateTiers(tiers: Tier[], radiusM: number): string | null {
  if (tiers.length < 1 || tiers.length > MAX_TIERS) return `Use de 1 a ${MAX_TIERS} faixas.`;
  const sorted = [...tiers].sort((a, b) => a.fromM - b.fromM);
  if (sorted[0]!.fromM !== 0) return 'A primeira faixa precisa começar em 0 km.';
  for (const [i, tier] of sorted.entries()) {
    if (!Number.isInteger(tier.fromM) || !Number.isInteger(tier.toM) || !Number.isInteger(tier.feeCents)) return 'Valores inválidos.';
    if (tier.toM <= tier.fromM) return 'Cada faixa precisa terminar depois de começar.';
    if (tier.feeCents < 0 || tier.feeCents > MAX_FIXED_FEE_CENTS) return 'A taxa de cada faixa vai de R$ 0,00 a R$ 50,00.';
    const next = sorted[i + 1];
    if (next && next.fromM !== tier.toM) return 'As faixas precisam ser seguidas';
  }
  if (sorted.at(-1)!.toM !== radiusM) return 'A última faixa precisa terminar no raio de entrega.';
  return null;
}

export interface FeeConfig {
  mode: FeeMode;
  fixedCents: number;
  tiers: Tier[];
  radiusM: number;
}

/** Taxa para a distância (m) em linha reta; `null` = fora do raio (não entrega). */
export function deliveryFee(config: FeeConfig, distanceM: number): number | null {
  if (distanceM > config.radiusM) return null;
  if (config.mode === 'fixed') return config.fixedCents;
  const sorted = [...config.tiers].sort((a, b) => a.fromM - b.fromM);
  const last = sorted.at(-1);
  for (const tier of sorted) {
    if (distanceM >= tier.fromM && distanceM < tier.toM) return tier.feeCents;
  }
  // A última faixa inclui o raio.
  if (last && distanceM === last.toM) return last.feeCents;
  return null;
}

/** Frete final: grátis acima de X compara o subtotal ANTES de cupom e frete (RN-04); X = 0 desliga. */
export function applyFreeShipping(feeCents: number, subtotalCents: number, freeAboveCents: number): number {
  if (freeAboveCents > 0 && subtotalCents >= freeAboveCents) return 0;
  return feeCents;
}

/** X precisa ser estritamente maior que o mínimo (R-17c); 0 desliga. */
export function validateFreeAbove(freeAboveCents: number, minOrderCents: number): string | null {
  if (freeAboveCents === 0) return null;
  return freeAboveCents > minOrderCents ? null : 'O valor para frete grátis precisa ser maior que o pedido mínimo.';
}

/** Distância haversine em metros (usada só em testes de paridade com o PostGIS). */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_008.8;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
