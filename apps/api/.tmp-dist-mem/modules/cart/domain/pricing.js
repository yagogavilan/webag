/** round_half_up para inteiros não negativos. */
const roundHalfUp = (numerator, denominator) => Math.floor((numerator * 2 + denominator) / (denominator * 2));
/** Comissão do pedido: base = subtotal menos cupom da loja (RN-10). */
export const commissionCents = (baseCents, pct) => roundHalfUp(baseCents * Math.round(pct * 100), 10_000);
/** Desconto "de face" do cupom, antes de tetos (desconto <= subtotal; frete grátis = o frete). */
export function couponFaceCents(coupon, subtotalCents, deliveryFeeCents) {
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
export function summarize(input) {
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
export function serviceFeeCents(type, value, subtotalCents) {
    if (type === 'fixa')
        return value;
    if (type === 'percentual')
        return roundHalfUp(subtotalCents * value, 10_000);
    return 0;
}
/** Menor frete possível da loja (para "a partir de R$ X" enquanto não há endereço). */
export function startingFee(mode, fixedCents, tiers) {
    return mode === 'fixed' || tiers.length === 0 ? fixedCents : Math.min(...tiers.map((t) => t.feeCents));
}
//# sourceMappingURL=pricing.js.map