import type { Cart, CheckoutChange } from '@webag/shared';
import { ApiError } from '../../api/problem';
import { t, type MessageKey } from '../../i18n';
import { etaFromBody, type EtaLike } from '../catalog/eta';

/**
 * Falhas do `POST /v1/orders`, por `code` estável (contrato-api). A tela decide a ação; o texto vem daqui. `detail` do
 * servidor (pt-BR) só entra onde ele traz informação que o app não tem (motivo da recusa, valor do mínimo).
 */
export type CheckoutFailure =
  | { kind: 'offline' }
  | { kind: 'cart-changed'; changes: CheckoutChange[]; cart: Cart | null }
  /** 409 `ETA_CHANGED` (WB-261): o fim da faixa piorou (mais de 5 min, DEC-068) desde o que o cliente aceitou; nenhum pedido foi criado; `eta` é a faixa nova. */
  | { kind: 'eta-changed'; eta: EtaLike | null }
  | { kind: 'store-closed'; opensAt: string | null }
  | { kind: 'stock'; name: string | null }
  | { kind: 'payer-document' }
  | { kind: 'declined'; reason: string | null }
  | { kind: 'provider-down' }
  | { kind: 'key-reused' }
  | { kind: 'email-unverified' }
  | { kind: 'too-many' }
  | { kind: 'blocked'; message: string }
  | { kind: 'unknown' };

const BLOCKED: Record<string, MessageKey> = {
  EMPTY_CART: 'checkout.blockedEmpty',
  ITEM_UNAVAILABLE: 'cart.soldOutBlock',
  BELOW_MINIMUM: 'checkout.blockedMinimum',
  OUT_OF_RANGE: 'cart.outOfRange',
  ADDRESS_REQUIRED: 'cart.needsAddress',
  PICKUP_UNAVAILABLE: 'cart.pickupUnavailable',
  ABOVE_MAX_ORDER: 'cart.aboveMax',
  LOGISTICS_CLOSED: 'ops.closedNow',
};

export function toCheckoutFailure(error: unknown): CheckoutFailure {
  if (!(error instanceof ApiError)) return { kind: 'unknown' };
  if (error.isConnectivity) return { kind: 'offline' };
  if (error.status === 429) return { kind: 'too-many' };
  switch (error.code) {
    case 'CART_CHANGED':
      return {
        kind: 'cart-changed',
        changes: Array.isArray(error.body.changes) ? (error.body.changes as CheckoutChange[]) : [],
        cart: typeof error.body.cart === 'object' && error.body.cart !== null ? (error.body.cart as Cart) : null,
      };
    case 'ETA_CHANGED':
      return { kind: 'eta-changed', eta: etaFromBody(error.body) };
    case 'STORE_CLOSED':
      return { kind: 'store-closed', opensAt: typeof error.body.opensAt === 'string' ? error.body.opensAt : null };
    case 'STOCK_CONFLICT':
      return { kind: 'stock', name: typeof error.body.name === 'string' ? error.body.name : null };
    case 'PAYER_DOCUMENT_REQUIRED':
      return { kind: 'payer-document' };
    case 'PAYMENT_DECLINED':
      return { kind: 'declined', reason: error.detail ?? null };
    case 'PAYMENT_PROVIDER_UNAVAILABLE':
      return { kind: 'provider-down' };
    case 'IDEMPOTENCY_KEY_REUSED':
      return { kind: 'key-reused' };
    case 'EMAIL_UNVERIFIED':
      return { kind: 'email-unverified' };
    default: {
      const key = BLOCKED[error.code];
      if (key) return { kind: 'blocked', message: error.code === 'BELOW_MINIMUM' && error.detail ? error.detail : t(key) };
      if (error.status >= 500) return { kind: 'provider-down' };
      return { kind: 'unknown' };
    }
  }
}

/** Uma linha por mudança, na linguagem da spec S3 ("Tênis: de R$ 89,90 para R$ 94,90"). */
export function describeChange(change: CheckoutChange, money: (cents: number) => string): string {
  const name = change.name ?? '';
  switch (change.kind) {
    case 'PRICE_CHANGED':
      return t('checkout.changePrice', { name, from: money(change.fromCents ?? 0), to: money(change.toCents ?? 0) });
    case 'QUANTITY_REDUCED':
      return t('checkout.changeQuantity', { name, from: change.fromQuantity ?? 0, to: change.toQuantity ?? 0 });
    case 'OUT_OF_STOCK':
      return t('checkout.changeSoldOut', { name });
    case 'UNAVAILABLE':
      return t('checkout.changeGone', { name });
    case 'DELIVERY_FEE_CHANGED':
      return t('checkout.changeDelivery', { from: money(change.fromCents ?? 0), to: money(change.toCents ?? 0) });
    case 'DISCOUNT_CHANGED':
      return t('checkout.changeDiscount', { from: money(change.fromCents ?? 0), to: money(change.toCents ?? 0) });
  }
}
