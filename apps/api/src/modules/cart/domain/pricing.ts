/**
 * Resumo de valores da sacola (RN-05, RN-09, RN-10). TUDO em centavos inteiros (nunca float). Função pura: o checkout
 * da Onda 4 chama exatamente esta, então o que a sacola mostra é o que o pedido cobra.
 */
export type CouponKind = 'percent' | 'fixed' | 'free_shipping';
export type CouponScope = 'store' | 'platform';

export interface PricingCoupon {
  kind: CouponKind;
  scope: CouponScope;
  /** Percentual 1..100 ou centavos (fixo). */
  value: number;
  percentCapCents: number | null;
}

export interface PricingInput {
  subtotalCents: number;
  /** Frete já com a regra "grátis acima de X" aplicada (RN-04); 0 na retirada. */
  deliveryFeeCents: number;
  serviceFeeCents: number;
  coupon: PricingCoupon | null;
  /** Comissão padrão em % (RN-10); limita o desconto de cupom da plataforma (DEC-016). */
  commissionPct: number;
  /** Comissão REAL do pedido (por item: loja > categoria > padrão); quando informada, vale como teto do cupom da plataforma. */
  commissionCapCents?: number;
  /** `cupom_total_minimo_cents` (HIP-037): com cupom o total nunca fica abaixo disso. */
  minTotalCents: number;
}

export interface PricingResult {
  subtotalCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  /** Desconto realmente aplicado (já depois do teto da comissão e do total mínimo). */
  discountCents: number;
  /** Quanto o cupom daria sem os tetos; o app mostra "limitado" quando for maior que `discountCents`. */
  couponFaceCents: number;
  totalCents: number;
  minimumTotalApplied: boolean;
  platformDiscountCapped: boolean;
}

/** round_half_up para inteiros não negativos. */
const roundHalfUp = (numerator: number, denominator: number): number => Math.floor((numerator * 2 + denominator) / (denominator * 2));

/** Comissão do pedido: base = subtotal menos cupom da loja (RN-10). */
export const commissionCents = (baseCents: number, pct: number): number => roundHalfUp(baseCents * Math.round(pct * 100), 10_000);

/** Desconto "de face" do cupom, antes de tetos (desconto <= subtotal; frete grátis = o frete). */
export function couponFaceCents(coupon: PricingCoupon, subtotalCents: number, deliveryFeeCents: number): number {
  switch (coupon.kind) {
    case 'percent': {
      const raw = roundHalfUp(subtotalCents * coupon.value, 100);
      return Math.min(coupon.percentCapCents === null ? raw : Math.min(raw, coupon.percentCapCents), subtotalCents);
    }
    case 'fixed':
      return Math.min(coupon.value, subtotalCents);
    case 'free_shipping':
      return deliveryFeeCents;
  }
}

export function summarize(input: PricingInput): PricingResult {
  const { subtotalCents, deliveryFeeCents, serviceFeeCents, coupon } = input;
  const face = coupon ? couponFaceCents(coupon, subtotalCents, deliveryFeeCents) : 0;
  let discount = face;
  let platformDiscountCapped = false;
  if (coupon?.scope === 'platform') {
    // No split o desconto da plataforma não passa da `application_fee` do pedido: comissão + entrega + serviço (WB-116 C6, DEC-036); a base é o subtotal (sem cupom de loja aqui).
    const cap = input.commissionCapCents ?? commissionCents(subtotalCents, input.commissionPct) + deliveryFeeCents + serviceFeeCents;
    if (discount > cap) {
      discount = cap;
      platformDiscountCapped = true;
    }
  }
  let total = subtotalCents - discount + deliveryFeeCents + serviceFeeCents;
  let minimumTotalApplied = false;
  if (discount > 0 && total < input.minTotalCents) {
    // Cupom que zeraria o total: cobra o mínimo (HIP-037) e o desconto mostrado cai na mesma medida.
    discount -= input.minTotalCents - total;
    total = input.minTotalCents;
    minimumTotalApplied = true;
  }
  return { subtotalCents, deliveryFeeCents, serviceFeeCents, discountCents: discount, couponFaceCents: face, totalCents: total, minimumTotalApplied, platformDiscountCapped };
}

/** Taxa de serviço (RN-10): `fixa` em centavos, `percentual` em pontos-base do subtotal (500 = 5,00%), `nenhuma` = 0. */
export function serviceFeeCents(type: string, value: number, subtotalCents: number): number {
  if (type === 'fixa') return value;
  if (type === 'percentual') return roundHalfUp(subtotalCents * value, 10_000);
  return 0;
}

/** Menor frete possível da loja (para "a partir de R$ X" enquanto não há endereço). */
export function startingFee(mode: 'fixed' | 'by_distance', fixedCents: number, tiers: { feeCents: number }[]): number {
  return mode === 'fixed' || tiers.length === 0 ? fixedCents : Math.min(...tiers.map((t) => t.feeCents));
}
