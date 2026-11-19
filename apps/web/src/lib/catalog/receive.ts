/**
 * "Você recebe" (DEC-035, RN-10): preço cadastrado (já com a comissão dentro) menos a comissão da Webag e a tarifa estimada do provedor.
 * `recebe = preço - round_half_up(preço x pct) - round_half_up(preço x tarifa)`, em centavos. A comissão real é congelada no pagamento
 * do pedido e a tarifa real vem do provedor: isto é estimativa.
 */
export function commissionCents(priceCents: number, pct: number): number {
  return Math.round((priceCents * pct) / 100 + Number.EPSILON);
}

/**
 * Tarifa do provedor (DEC-074e): estimativa conservadora com a do meio de pagamento MAIS CARO (PIX ou cartão) [HIPÓTESE].
 * Sem tarifa informada, devolve 0 (a linha então mostra só a comissão). A tarifa real vem do provedor e é a do extrato.
 */
export function worstProviderFeePct(fees: { pix: number; card: number } | null | undefined): number {
  if (!fees) return 0;
  const worst = Math.max(fees.pix, fees.card);
  return Number.isFinite(worst) && worst > 0 ? worst : 0;
}

/** `recebe = preço - comissão - tarifa`, cada parcela arredondada ao centavo mais próximo; `feePct` é opcional (0 = não considera). */
export function youReceive(priceCents: number, pct: number, feePct = 0): { commission: number; fee: number; receive: number } {
  const commission = commissionCents(priceCents, pct);
  const fee = feePct > 0 ? commissionCents(priceCents, feePct) : 0;
  return { commission, fee, receive: priceCents - commission - fee };
}

/** "Quero receber um valor": o menor preço que garante ao menos o valor desejado (nunca recebe menos que o pedido). */
export function priceToReceive(wantedCents: number, pct: number, feePct = 0): number {
  const rate = pct + Math.max(feePct, 0);
  if (rate <= 0) return wantedCents;
  if (rate >= 100) return wantedCents;
  let price = Math.ceil((wantedCents * 100) / (100 - rate));
  while (youReceive(price, pct, feePct).receive < wantedCents) price += 1;
  while (price > 1 && youReceive(price - 1, pct, feePct).receive >= wantedCents) price -= 1;
  return price;
}

export const pctText = (pct: number): string => `${String(pct).replace('.', ',')}%`;
