/**
 * "Você recebe" (DEC-035, RN-10): preço cadastrado (já com a comissão dentro) menos a comissão da Webag.
 * `recebe = preço - round_half_up(preço x pct)`, em centavos. A comissão real é congelada no pagamento do pedido: isto é estimativa.
 */
export function commissionCents(priceCents: number, pct: number): number {
  return Math.round((priceCents * pct) / 100 + Number.EPSILON);
}

export function youReceive(priceCents: number, pct: number): { commission: number; receive: number } {
  const commission = commissionCents(priceCents, pct);
  return { commission, receive: priceCents - commission };
}

/** "Quero receber um valor": o menor preço que garante ao menos o valor desejado (nunca recebe menos que o pedido). */
export function priceToReceive(wantedCents: number, pct: number): number {
  if (pct <= 0) return wantedCents;
  let price = Math.ceil((wantedCents * 100) / (100 - pct));
  while (youReceive(price, pct).receive < wantedCents) price += 1;
  while (price > 1 && youReceive(price - 1, pct).receive >= wantedCents) price -= 1;
  return price;
}

export const pctText = (pct: number): string => `${String(pct).replace('.', ',')}%`;
