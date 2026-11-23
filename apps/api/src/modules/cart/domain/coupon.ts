import type { CouponKind, CouponScope } from './pricing.js';

/** Motivo da recusa (`code` estável; o app escolhe o texto, WB-022 C2). */
export type CouponRejection =
  | 'COUPON_NOT_FOUND'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_EXHAUSTED'
  | 'COUPON_ALREADY_USED'
  | 'COUPON_MIN_ORDER'
  | 'COUPON_OTHER_STORE'
  | 'COUPON_FIRST_PURCHASE_ONLY'
  | 'COUPON_EMAIL_UNVERIFIED'
  | 'COUPON_NOT_ALLOWED'
  /** v1.1 R2 (campanhas): a mensagem neutra do antifraude, o esgotado do dia, a margem insuficiente e o "Faltam R$ X". */
  | 'COUPON_EXHAUSTED_TODAY'
  | 'COUPON_NOT_APPLICABLE'
  | 'COUPON_UNAVAILABLE'
  | 'COUPON_SHORTFALL';

export interface CouponFacts {
  kind: CouponKind;
  scope: CouponScope;
  storeId: string | null;
  minOrderCents: number;
  startsAt: Date;
  endsAt: Date;
  maxUses: number | null;
  perCustomerLimit: number;
  firstPurchaseOnly: boolean;
  active: boolean;
  /** WB-254: cupom pessoal (compensação); só o dono o enxerga e usa. */
  ownerUserId?: string | null;
}

export interface CouponContext {
  now: Date;
  /** Quem aplica o cupom (confere o dono de cupom pessoal). */
  userId?: string;
  cartStoreId: string;
  subtotalCents: number;
  emailVerified: boolean;
  /** Usos ativos (não devolvidos) do cupom por todos e por este cliente. */
  totalUses: number;
  customerUses: number;
  /** O cliente já tem pedido pago (primeira compra, RN-09). */
  hasPaidOrder: boolean;
  /** O cliente é dono ou funcionário da loja da sacola (autoconsumo, SEC-061). */
  isStoreMember: boolean;
}

/**
 * Valida o cupom na ordem que o cliente entende (WB-022 C2): existência e vigência primeiro, depois escopo e limites.
 * Devolve `null` quando vale.
 */
export function rejectCoupon(coupon: CouponFacts | null, ctx: CouponContext): CouponRejection | null {
  if (!coupon || !coupon.active) return 'COUPON_NOT_FOUND';
  if (coupon.ownerUserId && coupon.ownerUserId !== ctx.userId) return 'COUPON_NOT_FOUND'; // pessoal e intransferível: não revela que existe
  if (ctx.now < coupon.startsAt) return 'COUPON_NOT_STARTED';
  if (ctx.now >= coupon.endsAt) return 'COUPON_EXPIRED';
  if (coupon.scope === 'store' && coupon.storeId !== ctx.cartStoreId) return 'COUPON_OTHER_STORE';
  if (coupon.maxUses !== null && ctx.totalUses >= coupon.maxUses) return 'COUPON_EXHAUSTED';
  if (ctx.customerUses >= coupon.perCustomerLimit) return 'COUPON_ALREADY_USED';
  if (ctx.isStoreMember) return 'COUPON_NOT_ALLOWED';
  if ((coupon.scope === 'platform' || coupon.firstPurchaseOnly) && !ctx.emailVerified) return 'COUPON_EMAIL_UNVERIFIED';
  if (coupon.firstPurchaseOnly && ctx.hasPaidOrder) return 'COUPON_FIRST_PURCHASE_ONLY';
  if (ctx.subtotalCents < coupon.minOrderCents) return 'COUPON_MIN_ORDER';
  return null;
}
