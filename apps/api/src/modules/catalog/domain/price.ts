/** Preço e promoção (RN-05, WB-062, R-13). Tudo em centavos inteiros; datas em UTC no banco, hora local só na apresentação. */
export const MIN_PRICE_CENTS = 1;
export const MAX_PRICE_CENTS = 9_999_999;

export interface Promotion {
  promoPriceCents: number | null;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
}

/**
 * Início inclusivo; o fim é inclusivo "até o minuto informado" (R-13): a promoção de fim 23:59 vale até 23:59:59.999,
 * por isso o fim é guardado como o último milissegundo do minuto informado e comparado com `<=`.
 */
export function isPromotionActive(promo: Promotion, now: Date): boolean {
  if (promo.promoPriceCents === null || !promo.promoStartsAt || !promo.promoEndsAt) return false;
  return now.getTime() >= promo.promoStartsAt.getTime() && now.getTime() <= promo.promoEndsAt.getTime();
}

/** Preço vigente da variação: o da variação (se houver) herda o DESCONTO PERCENTUAL da promoção do produto (R-25c). */
export function effectivePrice(
  basePriceCents: number,
  variantPriceCents: number | null,
  promo: Promotion,
  now: Date,
): { priceCents: number; originalCents: number | null; discountPct: number | null } {
  const normal = variantPriceCents ?? basePriceCents;
  if (!isPromotionActive(promo, now) || promo.promoPriceCents === null || basePriceCents <= 0) {
    return { priceCents: normal, originalCents: null, discountPct: null };
  }
  const priceCents = variantPriceCents === null ? promo.promoPriceCents : Math.max(MIN_PRICE_CENTS, Math.round((variantPriceCents * promo.promoPriceCents) / basePriceCents));
  if (priceCents >= normal) return { priceCents: normal, originalCents: null, discountPct: null };
  return { priceCents, originalCents: normal, discountPct: discountPercent(normal, priceCents) };
}

/** Percentual exibido "de/por": arredondado para baixo; abaixo de 1% não é exibido (PO, O2-PRC-05). */
export function discountPercent(originalCents: number, priceCents: number): number | null {
  const pct = Math.floor(((originalCents - priceCents) * 100) / originalCents);
  return pct >= 1 ? pct : null;
}

export function validatePromotion(basePriceCents: number, promo: Promotion): string | null {
  const { promoPriceCents, promoStartsAt, promoEndsAt } = promo;
  if (promoPriceCents === null && !promoStartsAt && !promoEndsAt) return null;
  if (promoPriceCents === null || !promoStartsAt || !promoEndsAt) return 'Informe preço promocional, início e fim.';
  if (!Number.isInteger(promoPriceCents) || promoPriceCents < MIN_PRICE_CENTS) return 'O preço promocional precisa ser de pelo menos R$ 0,01.';
  if (promoPriceCents >= basePriceCents) return 'O preço promocional precisa ser menor que o normal.';
  if (promoEndsAt.getTime() < promoStartsAt.getTime()) return 'O fim da promoção precisa ser depois do início.';
  return null;
}

/** Fim informado em minutos vira o último milissegundo daquele minuto (R-13). */
export const endOfMinute = (date: Date): Date => new Date(Math.floor(date.getTime() / 60_000) * 60_000 + 59_999);
