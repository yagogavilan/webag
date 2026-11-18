import { ApiError } from '../../api/problem';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { formatOpensAt } from '../catalog/format';
import type { CartLine, CartView } from './model';

/**
 * Regras de decisão da tela da sacola, sem React (testáveis). A fonte da verdade é o servidor: `blockers` vem da API
 * (`checkout.blockers`); o app só escolhe o que mostrar e o que o botão do rodapé faz (onda-4 S1).
 */
export type CartCtaKind = 'pay' | 'closed' | 'add-more' | 'change-address' | 'sold-out' | 'remove-items';

export interface CartCta {
  kind: CartCtaKind;
  label: string;
  /** Aviso acima do rodapé que explica o motivo. */
  banner: { tone: 'info' | 'warning' | 'danger'; text: string; testID: string } | null;
  /** Rótulo inerte: o motivo já está escrito no botão. */
  inert: boolean;
}

const has = (view: CartView, code: CartView['blockers'][number]): boolean => view.blockers.includes(code);

export function deriveCta(view: CartView): CartCta {
  const toPay = t('cart.toPayment');
  if (has(view, 'STORE_CLOSED') || has(view, 'STORE_UNAVAILABLE')) {
    const when = formatOpensAt(view.opensAt);
    return {
      kind: 'closed',
      label: when ? t('cart.closedCtaAt', { when }) : t('cart.closedCta'),
      banner: { tone: 'info', text: when ? t('cart.closedBannerAt', { when }) : t('cart.closedBanner'), testID: 'cart.closed-banner' },
      inert: true,
    };
  }
  if (has(view, 'BELOW_MINIMUM')) {
    const missing = view.summary?.missingForMinimumCents;
    return {
      kind: 'add-more',
      label: t('cart.addMore'),
      banner: missing ? { tone: 'warning', text: t('cart.minimumBanner', { value: formatMoney(missing) }), testID: 'cart.minimum-banner' } : null,
      inert: false,
    };
  }
  if (has(view, 'NEEDS_ADDRESS')) {
    return { kind: 'change-address', label: t('cart.changeAddress'), banner: { tone: 'warning', text: t('cart.needsAddress'), testID: 'cart.address-banner' }, inert: false };
  }
  if (has(view, 'OUT_OF_RANGE')) {
    return { kind: 'change-address', label: t('cart.changeAddress'), banner: { tone: 'danger', text: t('cart.outOfRange'), testID: 'cart.address-banner' }, inert: false };
  }
  if (has(view, 'PICKUP_UNAVAILABLE')) {
    return { kind: 'add-more', label: t('cart.addMore'), banner: { tone: 'warning', text: t('cart.pickupUnavailable'), testID: 'cart.address-banner' }, inert: false };
  }
  if (has(view, 'ABOVE_MAX_ORDER')) {
    return { kind: 'remove-items', label: toPay, banner: { tone: 'danger', text: t('cart.aboveMax'), testID: 'cart.max-banner' }, inert: false };
  }
  if (has(view, 'ITEM_UNAVAILABLE') || view.lines.some((l) => !l.available)) {
    // botão ativo: ao tocar, rola até o item e explica (nunca desabilitado sem motivo)
    return { kind: 'sold-out', label: toPay, banner: null, inert: false };
  }
  return { kind: 'pay', label: toPay, banner: null, inert: false };
}

/** Índice do primeiro item que impede o pagamento (para rolar até ele). */
export const firstBlockedIndex = (lines: readonly CartLine[]): number => lines.findIndex((l) => !l.available);

/** Mudanças de preço ou quantidade que o cliente ainda não aceitou (POST /v1/cart/acknowledge). */
export function hasAcknowledgeable(lines: readonly CartLine[]): boolean {
  return lines.some((l) => l.warnings.some((w) => w.code === 'PRICE_CHANGED' || w.code === 'QUANTITY_EXCEEDS_STOCK'));
}

/** Texto do aviso de um item, na linguagem da spec (S1 "Avisos por item"). */
export function warningText(line: CartLine): { tone: 'info' | 'warning' | 'danger'; text: string } | null {
  const w = line.warnings[0];
  if (!w) return null;
  switch (w.code) {
    case 'OUT_OF_STOCK':
      return { tone: 'danger', text: t('cart.warnSoldOut') };
    case 'UNAVAILABLE':
      return { tone: 'danger', text: t('cart.warnGone') };
    case 'QUANTITY_EXCEEDS_STOCK': {
      const n = w.maxQuantity ?? line.maxQuantity;
      return { tone: 'warning', text: n === 1 ? t('cart.warnQtyOne') : t('cart.warnQty', { n }) };
    }
    case 'PRICE_CHANGED':
      return w.fromCents !== undefined && w.toCents !== undefined
        ? { tone: 'info', text: t('cart.warnPrice', { from: formatMoney(w.fromCents), to: formatMoney(w.toCents) }) }
        : { tone: 'info', text: w.message };
  }
}

/**
 * Mensagem do cupom recusado. `detail` do servidor já vem em pt-BR e com os valores (data, mínimo); só cai nos textos fixos
 * quando ele não vem.
 */
export function couponErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return t('cart.couponGeneric');
  if (error.isConnectivity) return t('cart.couponOffline');
  if (error.status === 429) return t('cart.couponTooMany');
  if (error.detail && error.status === 422) return error.detail;
  switch (error.code) {
    case 'COUPON_NOT_FOUND':
      return t('cart.couponNotFound');
    case 'COUPON_ALREADY_USED':
      return t('cart.couponUsed');
    case 'COUPON_EXHAUSTED':
      return t('cart.couponExhausted');
    case 'COUPON_OTHER_STORE':
      return t('cart.couponOtherStore');
    default:
      return t('cart.couponGeneric');
  }
}
