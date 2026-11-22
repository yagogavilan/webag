/**
 * Reajuste de preço em massa (A3, ADR-018 D17): percentual de -90 a +500 com no máximo 2 casas, cálculo em INTEIRO e arredondamento meio para
 * cima ao centavo. Nada de float no resultado. O resultado fora de 1 a 9.999.999 centavos bloqueia o item (`BULK_BLOCKED`, na camada de cima).
 */
export const PERCENT_MIN = -90;
export const PERCENT_MAX = 500;

/** `10` / `5.5` / `-0.25` em pontos-base (1000 / 550 / -25); `null` se tem mais de 2 casas ou está fora de -90..+500. */
export function percentToBp(value: number): number | null {
  if (!Number.isFinite(value) || value < PERCENT_MIN || value > PERCENT_MAX) return null;
  const bp = Math.round(value * 100);
  return Math.abs(value * 100 - bp) < 1e-7 ? bp : null;
}

/** `cents x (1 + bp/10000)`, meio para cima, em inteiros (centavos até ~1e7 x 6e4 ficam muito abaixo de 2^53). */
export function adjustByBp(cents: number, bp: number): number {
  return Math.floor((cents * (10_000 + bp) * 2 + 10_000) / 20_000);
}

export type PriceAdjust = { mode: 'percent'; bp: number } | { mode: 'amount'; cents: number };

export const adjustPriceCents = (cents: number, adjust: PriceAdjust): number => (adjust.mode === 'percent' ? adjustByBp(cents, adjust.bp) : cents + adjust.cents);

/** Variação do preço em % com 1 casa (para a prévia): `+10,0`, `-90,0`. */
export const changePct = (fromCents: number, toCents: number): number => (fromCents === 0 ? 0 : Math.round(((toCents - fromCents) / fromCents) * 1000) / 10);
