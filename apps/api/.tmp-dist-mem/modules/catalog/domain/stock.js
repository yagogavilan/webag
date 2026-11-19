/** Estoque (RN-06): `disponível = estoque - reservado`; nunca negativo; 0..99.999 por variação. */
export const MAX_STOCK = 99_999;
export const available = (stock, reserved) => stock - reserved;
/** Novo estoque ou `null` se o ajuste deixaria menos que o reservado (ou fora de 0..99.999). */
export function applyAdjust(stock, reserved, adjust) {
    const next = 'delta' in adjust ? stock + adjust.delta : adjust.set;
    if (!Number.isInteger(next) || next < 0 || next > MAX_STOCK)
        return { error: 'out_of_range' };
    if (next < reserved)
        return { error: 'below_reserved' };
    return { stock: next };
}
/**
 * Alerta de estoque baixo: 1 vez por variação; rearma quando `disponível > limite` e dispara de novo ao voltar a `<=`
 * (R-14, WB-064 C2). Devolve se deve notificar agora e o novo estado do gatilho.
 */
export function lowStockTransition(availableNow, threshold, armed) {
    if (availableNow > threshold)
        return { notify: false, armed: true };
    return armed ? { notify: true, armed: false } : { notify: false, armed: false };
}
export const isLow = (availableNow, threshold) => availableNow <= threshold;
/** Produto visível ao cliente (RN-03): ativo, não moderado, loja visível e 1+ variação com disponível > 0. */
export function isProductVisible(input) {
    return input.status === 'active' && input.moderationStatus !== 'removed' && input.moderationStatus !== 'paused' && input.storeVisible;
}
/** Entra nas ofertas e buscas só com disponibilidade; sem estoque aparece como "Indisponível" na página da loja. */
export const isOfferable = (variantsAvailable) => variantsAvailable.some((n) => n > 0);
//# sourceMappingURL=stock.js.map