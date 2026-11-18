import type { Cart } from '@webag/shared';
import type { CartState } from './store';

/**
 * A sacola como a tela enxerga, venha ela do servidor (logado) ou do aparelho (visitante). A tela nunca soma preço sozinha
 * quando há resumo do servidor: o total mostrado é o que o pedido vai cobrar (RN-05).
 */
export interface CartLineWarning {
  code: 'PRICE_CHANGED' | 'QUANTITY_EXCEEDS_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE';
  message: string;
  fromCents?: number | undefined;
  toCents?: number | undefined;
  maxQuantity?: number | undefined;
}

export interface CartLine {
  key: string;
  variantId: string;
  productId: string;
  name: string;
  variantLabel: string | null;
  urls: Record<string, string>;
  quantity: number;
  maxQuantity: number;
  unitPriceCents: number;
  originalPriceCents: number | null;
  lineTotalCents: number;
  available: boolean;
  warnings: CartLineWarning[];
}

export interface CartSummaryView {
  subtotalCents: number;
  deliveryCents: number;
  deliveryEstimated: boolean;
  freeShipping: boolean;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
  minimumTotalApplied: boolean;
  missingForMinimumCents: number | null;
}

export type CartBlocker = Cart['checkout']['blockers'][number];

export interface CartView {
  source: 'server' | 'local';
  storeId: string;
  storeName: string;
  logoUrls: Record<string, string> | null;
  open: boolean;
  opensAt: string | null;
  etaMin: number | null;
  etaMax: number | null;
  lines: CartLine[];
  coupon: { code: string; applied: boolean; rejection: string | null } | null;
  /** Só com a sacola do servidor; visitante vê o subtotal e o resto é calculado ao entrar. */
  summary: CartSummaryView | null;
  subtotalCents: number;
  blockers: CartBlocker[];
  canCheckout: boolean;
  /** Unidades que valem no pedido (item esgotado conta 0). */
  count: number;
}

export function fromServer(cart: Cart): CartView | null {
  if (!cart.store || cart.items.length === 0) return null;
  const s = cart.summary;
  return {
    source: 'server',
    storeId: cart.store.id,
    storeName: cart.store.name,
    logoUrls: cart.store.logo.urls,
    open: cart.store.open,
    opensAt: cart.store.opensAt,
    etaMin: cart.store.etaMinMinutes,
    etaMax: cart.store.etaMaxMinutes,
    lines: cart.items.map((i) => ({
      key: i.variantId,
      variantId: i.variantId,
      productId: i.productId,
      name: i.name,
      variantLabel: Object.values(i.attributes).join(' · ') || null,
      urls: i.image.urls,
      quantity: i.quantity,
      maxQuantity: i.maxQuantity,
      unitPriceCents: i.unitPrice.amount,
      originalPriceCents: i.originalUnitPrice?.amount ?? null,
      lineTotalCents: i.lineTotal.amount,
      available: i.available,
      warnings: i.warnings.map((w) => ({ code: w.code, message: w.message, fromCents: w.fromCents, toCents: w.toCents, maxQuantity: w.maxQuantity })),
    })),
    coupon: cart.coupon ? { code: cart.coupon.code, applied: cart.coupon.applied, rejection: cart.coupon.rejection } : null,
    summary: {
      subtotalCents: s.subtotal.amount,
      deliveryCents: s.delivery.amount,
      deliveryEstimated: s.deliveryEstimated,
      freeShipping: s.freeShipping,
      serviceFeeCents: s.serviceFee.amount,
      discountCents: s.discount.amount,
      totalCents: s.total.amount,
      minimumTotalApplied: s.minimumTotalApplied,
      missingForMinimumCents: s.missingForMinimum?.amount ?? null,
    },
    subtotalCents: s.subtotal.amount,
    blockers: cart.checkout.blockers,
    canCheckout: cart.checkout.canCheckout,
    count: cart.items.reduce((n, i) => n + i.quantity, 0),
  };
}

export function fromLocal(state: CartState): CartView | null {
  if (state.storeId === null || state.items.length === 0) return null;
  const lines = state.items.map<CartLine>((i) => ({
    key: i.key,
    variantId: i.variantId,
    productId: i.productId,
    name: i.name,
    variantLabel: i.variantLabel,
    urls: i.urls,
    quantity: i.quantity,
    maxQuantity: i.maxQuantity,
    unitPriceCents: i.unitPriceCents,
    originalPriceCents: i.originalPriceCents,
    lineTotalCents: i.unitPriceCents * i.quantity,
    available: true,
    warnings: [],
  }));
  const subtotal = lines.reduce((n, l) => n + l.lineTotalCents, 0);
  return {
    source: 'local',
    storeId: state.storeId,
    storeName: state.storeName ?? '',
    logoUrls: null,
    open: true,
    opensAt: null,
    etaMin: null,
    etaMax: null,
    lines,
    coupon: null,
    summary: null,
    subtotalCents: subtotal,
    blockers: [],
    canCheckout: false,
    count: lines.reduce((n, l) => n + l.quantity, 0),
  };
}
