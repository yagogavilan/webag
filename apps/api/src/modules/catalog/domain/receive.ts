/**
 * "Você recebe cerca de" (DEC-035, RN-10) no servidor, para a tabela de preço e estoque: `preço - round_half_up(preço x comissão) - round_half_up(preço x tarifa)`,
 * em centavos inteiros, com percentuais em pontos-base (1000 = 10,00%). É a MESMA conta do painel (`apps/web/src/lib/catalog/receive.ts`); a comissão real é
 * congelada no pagamento do pedido e a tarifa real vem do provedor, então isto é estimativa.
 */
const roundHalfUp = (numerator: number, denominator: number): number => Math.floor((numerator * 2 + denominator) / (denominator * 2));

export const pctToBp = (pct: number): number => Math.round(pct * 100);

export function youReceiveCents(priceCents: number, commissionBp: number, providerFeeBp: number): number {
  const commission = roundHalfUp(priceCents * commissionBp, 10_000);
  const fee = providerFeeBp > 0 ? roundHalfUp(priceCents * providerFeeBp, 10_000) : 0;
  return priceCents - commission - fee;
}
