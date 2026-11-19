import type { Cart, CheckoutChange, CreateOrderRequest } from '@webag/shared';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { formatDeliveryBack, formatOpensAt } from '../catalog/format';
import type { Address } from '../address/types';
import type { CartView } from '../cart/model';

/**
 * Decisões do checkout sem React (testáveis). O servidor manda: `blockers` e `summary` vêm da API; o app só escolhe o que
 * o botão do rodapé faz e o que explicar (onda-4 S3). Nada é calculado aqui: o total é o do servidor.
 */
export type ReceiveMode = 'delivery' | 'pickup';
export type PayMethod = 'pix' | 'card';

export type GateKind = 'ready' | 'closed' | 'address' | 'range' | 'back';

export interface Gate {
  kind: GateKind;
  /** Rótulo do botão quando não é "pagar" (nunca fica desabilitado sem explicação). */
  label: string | null;
  banner: { tone: 'info' | 'warning' | 'danger'; text: string; testID: string } | null;
  inert: boolean;
}

const READY: Gate = { kind: 'ready', label: null, banner: null, inert: false };

/** O endereço serve para o frete exato? Só o completo e já gravado na conta (`addressId` do servidor). */
export const addressIsReady = (address: Address | null): boolean => Boolean(address && address.remote && address.precision === 'full');

export function deriveGate(view: CartView, mode: ReceiveMode, address: Address | null): Gate {
  const has = (code: CartView['blockers'][number]): boolean => view.blockers.includes(code);
  if (has('STORE_CLOSED') || has('STORE_UNAVAILABLE')) {
    const when = formatOpensAt(view.opensAt);
    return {
      kind: 'closed',
      label: when ? t('cart.closedCtaAt', { when }) : t('cart.closedCta'),
      banner: { tone: 'danger', text: when ? t('checkout.closedBannerAt', { when }) : t('checkout.closedBanner'), testID: 'checkout.closed-banner' },
      inert: true,
    };
  }
  if (mode === 'delivery') {
    if (!addressIsReady(address) || has('NEEDS_ADDRESS')) {
      return { kind: 'address', label: t('checkout.completeAddress'), banner: { tone: 'warning', text: t('checkout.needsFullAddress'), testID: 'checkout.address-banner' }, inert: false };
    }
    if (has('LOGISTICS_CLOSED')) {
      const when = formatDeliveryBack(view.logisticsOpensAt);
      return { kind: 'back', label: t('checkout.backToCart'), banner: { tone: 'warning', text: `${when ? t('ops.back', { when }) : t('ops.paused')}. ${when ? t('ops.backSub') : t('ops.pausedSub')}`, testID: 'checkout.logistics-banner' }, inert: false };
    }
    if (has('OUT_OF_RANGE')) {
      return { kind: 'range', label: t('checkout.changeAddress'), banner: { tone: 'danger', text: t('checkout.outOfRange'), testID: 'checkout.range-banner' }, inert: false };
    }
  }
  if (has('PICKUP_UNAVAILABLE')) {
    return { kind: 'back', label: t('checkout.backToCart'), banner: { tone: 'warning', text: t('cart.pickupUnavailable'), testID: 'checkout.pickup-banner' }, inert: false };
  }
  if (has('BELOW_MINIMUM')) {
    const missing = view.summary?.missingForMinimumCents;
    return { kind: 'back', label: t('checkout.backToCart'), banner: { tone: 'warning', text: missing ? t('cart.minimumBanner', { value: formatMoney(missing) }) : t('checkout.blockedMinimum'), testID: 'checkout.minimum-banner' }, inert: false };
  }
  if (has('ABOVE_MAX_ORDER')) {
    return { kind: 'back', label: t('checkout.backToCart'), banner: { tone: 'danger', text: t('cart.aboveMax'), testID: 'checkout.max-banner' }, inert: false };
  }
  if (has('EMPTY') || has('ITEM_UNAVAILABLE') || view.lines.some((l) => !l.available)) {
    return { kind: 'back', label: t('checkout.backToCart'), banner: { tone: 'warning', text: t('cart.soldOutBlock'), testID: 'checkout.items-banner' }, inert: false };
  }
  return READY;
}

export function payLabel(method: PayMethod, totalCents: number, installments = 1): string {
  const total = formatMoney(totalCents);
  if (method === 'pix') return t('checkout.payPix', { total });
  return installments > 1 ? t('checkout.payCard', { total, n: installments }) : t('checkout.payCardOne', { total });
}

export interface OrderDraft {
  mode: ReceiveMode;
  addressId: string | null;
  method: PayMethod;
  card?: { token: string; installments: number; paymentMethodId?: string | undefined; issuerId?: string | undefined } | null;
  /** 11 dígitos, só quando o provedor pediu (`PAYER_DOCUMENT_REQUIRED`). */
  payerDocument?: string | null;
}

/** Corpo do `POST /v1/orders`. NUNCA leva valor além do `expectedTotalCents` (conferência): quem calcula é o servidor. */
export function buildOrderBody(cart: Cart, draft: OrderDraft): CreateOrderRequest {
  return {
    mode: draft.mode,
    ...(draft.mode === 'delivery' && draft.addressId ? { addressId: draft.addressId } : {}),
    cartRevision: cart.revision,
    expectedTotalCents: cart.summary.total.amount,
    paymentMethod: draft.method,
    ...(draft.method === 'card' && draft.card
      ? {
          card: {
            token: draft.card.token,
            installments: draft.card.installments,
            ...(draft.card.paymentMethodId ? { paymentMethodId: draft.card.paymentMethodId } : {}),
            ...(draft.card.issuerId ? { issuerId: draft.card.issuerId } : {}),
          },
        }
      : {}),
    ...(draft.payerDocument ? { payerDocument: draft.payerDocument } : {}),
  };
}

/** Avisos que a sacola já traz ao abrir o checkout viram a lista de "Algo mudou" (conferência ao abrir, RN-05). */
export function pendingChanges(cart: Cart): CheckoutChange[] {
  const changes: CheckoutChange[] = [];
  for (const item of cart.items) {
    for (const w of item.warnings) {
      if (w.code === 'PRICE_CHANGED') changes.push({ kind: 'PRICE_CHANGED', variantId: item.variantId, name: item.name, ...(w.fromCents !== undefined ? { fromCents: w.fromCents } : {}), ...(w.toCents !== undefined ? { toCents: w.toCents } : {}) });
      else if (w.code === 'QUANTITY_EXCEEDS_STOCK') changes.push({ kind: 'QUANTITY_REDUCED', variantId: item.variantId, name: item.name, ...(w.requestedQuantity !== undefined ? { fromQuantity: w.requestedQuantity } : {}), ...(w.maxQuantity !== undefined ? { toQuantity: w.maxQuantity } : {}) });
    }
  }
  return changes;
}
