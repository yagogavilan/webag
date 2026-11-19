import { allocateProportional, applyBp } from './money.js';
export const MAX_COMMISSION_BP = 3000; // WB-105 C4: 0 a 30%
const active = (row, at) => row.startsAt <= at && (row.endsAt === null || at < row.endsAt);
/** A linha mais recente em vigor (começou por último). Alteração futura não vale antes do início (WB-105 C2/C3). */
export function currentRate(rows, at) {
    let best = null;
    for (const row of rows)
        if (active(row, at) && (!best || row.startsAt > best.startsAt))
            best = row;
    return best;
}
/**
 * Precedência da RN-10: loja (com vigência) > categoria do produto (a própria, depois a mãe) > padrão.
 * `categoryRates` vem na ordem da cadeia: [categoria do produto, categoria mãe].
 */
export function resolveCommission(input) {
    const store = currentRate(input.storeRates, input.at);
    if (store && store.pctBp !== null)
        return { pctBp: store.pctBp, source: 'store' };
    for (const rows of input.categoryRates) {
        const rate = currentRate(rows, input.at);
        if (rate && rate.pctBp !== null)
            return { pctBp: rate.pctBp, source: 'category' };
    }
    return { pctBp: input.defaultBp, source: 'default' };
}
/**
 * RN-10 inteira, em uma função pura (a sacola, o pedido e o ledger leem a mesma conta).
 *  - base = subtotal - cupom da loja; o cupom da loja é rateado entre os itens pelo método do maior resto;
 *  - comissão = soma, por item, de round_half_up(base do item x percentual do item);
 *  - taxa de entrega e de serviço são receita da Webag; o lojista recebe itens - cupom da loja - comissão (DEC-036a);
 *  - desconto da plataforma limitado à `application_fee` (a Webag nunca paga ao lojista por fora);
 *  - total = bruto da loja + entrega + serviço - desconto da plataforma.
 */
export function computeOrderFinance(input) {
    const ints = [input.storeCouponCents, input.platformDiscountCents, input.deliveryFeeCents, input.serviceFeeCents, ...input.items.map((i) => i.subtotalCents)];
    if (ints.some((n) => !Number.isInteger(n) || n < 0))
        throw new Error('valores monetários devem ser inteiros não negativos');
    if (input.items.some((i) => !Number.isInteger(i.pctBp) || i.pctBp < 0 || i.pctBp > MAX_COMMISSION_BP))
        throw new Error('percentual de comissão fora de 0 a 30%');
    const subtotalCents = input.items.reduce((sum, i) => sum + i.subtotalCents, 0);
    if (input.storeCouponCents > subtotalCents)
        throw new Error('cupom da loja maior que o subtotal');
    const couponShares = allocateProportional(input.storeCouponCents, input.items.map((i) => i.subtotalCents));
    const items = input.items.map((item, index) => {
        const baseCents = item.subtotalCents - couponShares[index];
        return { baseCents, pctBp: item.pctBp, commissionCents: applyBp(baseCents, item.pctBp) };
    });
    const commissionCents = items.reduce((sum, i) => sum + i.commissionCents, 0);
    // RN-09/RN-10: o desconto da plataforma sai da parte da Webag (`application_fee` antes do desconto), nunca do lojista.
    const platformDiscountCents = Math.min(input.platformDiscountCents, commissionCents + input.deliveryFeeCents + input.serviceFeeCents);
    const merchantGrossCents = subtotalCents - input.storeCouponCents;
    const applicationFeeCents = commissionCents + input.deliveryFeeCents + input.serviceFeeCents - platformDiscountCents;
    return {
        subtotalCents,
        storeCouponCents: input.storeCouponCents,
        baseCents: subtotalCents - input.storeCouponCents,
        items,
        commissionCents,
        platformDiscountCents,
        platformDiscountCapped: platformDiscountCents < input.platformDiscountCents,
        deliveryFeeCents: input.deliveryFeeCents,
        serviceFeeCents: input.serviceFeeCents,
        totalCents: merchantGrossCents + input.deliveryFeeCents - platformDiscountCents + input.serviceFeeCents,
        merchantGrossCents,
        applicationFeeCents,
        platformRevenueCents: applicationFeeCents,
        merchantNetBeforeProviderFeeCents: merchantGrossCents - commissionCents,
    };
}
/** Tarifa estimada do provedor (HIP-016, "a confirmar"): `fee_details` real substitui no ledger quando o MP informar. */
export const estimateProviderFeeCents = (totalCents, method, rates) => applyBp(totalCents, method === 'pix' ? rates.pixBp : rates.cardBp);
//# sourceMappingURL=commission.js.map