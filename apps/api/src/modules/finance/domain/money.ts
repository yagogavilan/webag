/**
 * Aritmética de dinheiro em centavos inteiros (RN-01). Nada de float no resultado: tudo passa por `roundHalfUp`.
 * Os produtos intermediários ficam abaixo de 2^53 (centavos até ~1e9 x pontos-base até 1e4).
 */
export const roundHalfUp = (numerator: number, denominator: number): number => {
  if (denominator <= 0) throw new Error('denominador deve ser positivo');
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
};

/** Percentual em pontos-base (1000 = 10,00%) aplicado a centavos, round_half_up. */
export const applyBp = (cents: number, bp: number): number => roundHalfUp(cents * bp, 10_000);

/** `10` (ou `10.5`) em % vira pontos-base inteiros (1000 / 1050). */
export const pctToBp = (pct: number): number => Math.round(pct * 100);

/**
 * Reparte `total` proporcionalmente aos `weights` (método do maior resto): a soma das partes é EXATAMENTE `total`.
 * Empate no resto: vai para o menor índice (determinístico).
 */
export function allocateProportional(total: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new Error('total inválido');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum === 0) return weights.map(() => 0);
  const base = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, index) => ({ index, remainder: (total * w) % sum }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left === 0) break;
    base[index]! += 1;
    left -= 1;
  }
  return base;
}
