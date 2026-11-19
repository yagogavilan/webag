/**
 * Valida o cupom na ordem que o cliente entende (WB-022 C2): existência e vigência primeiro, depois escopo e limites.
 * Devolve `null` quando vale.
 */
export function rejectCoupon(coupon, ctx) {
    if (!coupon || !coupon.active)
        return 'COUPON_NOT_FOUND';
    if (coupon.ownerUserId && coupon.ownerUserId !== ctx.userId)
        return 'COUPON_NOT_FOUND'; // pessoal e intransferível: não revela que existe
    if (ctx.now < coupon.startsAt)
        return 'COUPON_NOT_STARTED';
    if (ctx.now >= coupon.endsAt)
        return 'COUPON_EXPIRED';
    if (coupon.scope === 'store' && coupon.storeId !== ctx.cartStoreId)
        return 'COUPON_OTHER_STORE';
    if (coupon.maxUses !== null && ctx.totalUses >= coupon.maxUses)
        return 'COUPON_EXHAUSTED';
    if (ctx.customerUses >= coupon.perCustomerLimit)
        return 'COUPON_ALREADY_USED';
    if (ctx.isStoreMember)
        return 'COUPON_NOT_ALLOWED';
    if ((coupon.scope === 'platform' || coupon.firstPurchaseOnly) && !ctx.emailVerified)
        return 'COUPON_EMAIL_UNVERIFIED';
    if (coupon.firstPurchaseOnly && ctx.hasPaidOrder)
        return 'COUPON_FIRST_PURCHASE_ONLY';
    if (ctx.subtotalCents < coupon.minOrderCents)
        return 'COUPON_MIN_ORDER';
    return null;
}
//# sourceMappingURL=coupon.js.map