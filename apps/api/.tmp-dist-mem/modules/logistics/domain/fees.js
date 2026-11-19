/**
 * Tabela de taxa de entrega do admin (DEC-036, RN-04, WB-236). Distâncias em METROS inteiros, dinheiro em centavos.
 * Faixa = `[fromM, toM)`: o limite superior pertence à faixa seguinte; a ÚLTIMA faixa inclui o raio.
 * Escopo do endereço de destino: bairro > cidade > padrão geral.
 */
export const MAX_FEE_TIERS = 6;
export const MAX_DELIVERY_FEE_CENTS = 5000;
/** Padrão da taxa de troca: 50% da taxa de entrega, arredondado para cima (DEC-039a). */
export const defaultExchangeFee = (feeCents) => Math.ceil(feeCents / 2);
/** Devolve mensagem de erro (pt-BR) ou null. `radiusM` = `raio_max_km` em metros; `exchangeMaxCents` = `taxa_coleta_max_cents`. */
export function validateFeeTiers(tiers, radiusM, exchangeMaxCents) {
    if (tiers.length < 1 || tiers.length > MAX_FEE_TIERS)
        return `Use de 1 a ${MAX_FEE_TIERS} faixas.`;
    const sorted = [...tiers].sort((a, b) => a.fromM - b.fromM);
    if (sorted[0].fromM !== 0)
        return 'A primeira faixa precisa começar em 0 km.';
    for (const [index, tier] of sorted.entries()) {
        const ints = [tier.fromM, tier.toM, tier.feeCents, tier.exchangeFeeCents, tier.expectedCostCents, tier.etaMinutes];
        if (ints.some((n) => !Number.isInteger(n) || n < 0))
            return 'Valores inválidos.';
        if (tier.toM <= tier.fromM)
            return 'Cada faixa precisa terminar depois de começar.';
        if (tier.feeCents > MAX_DELIVERY_FEE_CENTS)
            return 'A taxa de entrega vai de R$ 0,00 a R$ 50,00.';
        if (tier.exchangeFeeCents > exchangeMaxCents)
            return `A taxa de troca vai até R$ ${(exchangeMaxCents / 100).toFixed(2).replace('.', ',')}.`;
        const next = sorted[index + 1];
        if (next && next.fromM !== tier.toM)
            return 'As faixas precisam ser seguidas, sem lacuna nem sobreposição.';
    }
    if (sorted.at(-1).toM !== radiusM)
        return `A última faixa precisa terminar no raio máximo de entrega (${radiusM / 1000} km).`;
    return null;
}
/** Faixa da distância; `null` = fora da tabela (não entrega). A última faixa inclui o raio. */
export function pickTier(tiers, distanceM) {
    const sorted = [...tiers].sort((a, b) => a.fromM - b.fromM);
    for (const [position, tier] of sorted.entries()) {
        if (distanceM >= tier.fromM && distanceM < tier.toM)
            return { tier, position };
    }
    const last = sorted.at(-1);
    return last && distanceM === last.toM ? { tier: last, position: sorted.length - 1 } : null;
}
/** Frete grátis acima de X compara o subtotal ANTES de cupom e frete (RN-04); X = 0 desliga. */
export const applyFreeShipping = (feeCents, subtotalCents, freeAboveCents) => (freeAboveCents > 0 && subtotalCents >= freeAboveCents ? 0 : feeCents);
/** X precisa ser estritamente maior que o pedido mínimo; 0 desliga (R-17c). */
export const validateFreeAbove = (freeAboveCents, minOrderCents) => freeAboveCents === 0 || freeAboveCents > minOrderCents ? null : 'O valor para frete grátis precisa ser maior que o pedido mínimo.';
/** Menor taxa da tabela: "a partir de R$ X" quando o endereço ainda é aproximado (WB-237 C1). */
export const startingFee = (tiers) => (tiers.length === 0 ? null : Math.min(...tiers.map((t) => t.feeCents)));
//# sourceMappingURL=fees.js.map