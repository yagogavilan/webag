import {
  acknowledgeCart,
  applyCartCoupon,
  clearCart,
  getCart,
  mergeCart,
  removeCartCoupon,
  removeCartItem,
  setCartItem,
  type Cart,
  type GetCartParams,
} from '@webag/shared';
import { request } from './http';

/**
 * Sacola da conta (`/v1/cart`, ADR-010): uma por conta, de uma loja só, recalculada no servidor em toda leitura (RN-05).
 * `PUT /items/{variantId}` define a quantidade absoluta: repetir em rede ruim é seguro e dispensa `Idempotency-Key`.
 * O app NUNCA calcula valor: o que a tela mostra é o `summary` do servidor.
 */
export type CartParams = GetCartParams;

export const fetchCart = (params: CartParams, signal?: AbortSignal): Promise<Cart> =>
  request((init) => getCart(params, init), { retry: true, ...(signal ? { signal } : {}) });

export const putCartItem = (variantId: string, quantity: number, params: CartParams, replaceStore = false): Promise<Cart> =>
  request((init) => setCartItem(variantId, { quantity, ...(replaceStore ? { replaceStore: true } : {}) }, params, init), { retry: true });

export const deleteCartItem = (variantId: string, params: CartParams): Promise<Cart> =>
  request((init) => removeCartItem(variantId, params, init), { retry: true });

export const emptyCart = (params: CartParams): Promise<Cart> => request((init) => clearCart(params, init), { retry: true });

export const putCartCoupon = (code: string, params: CartParams): Promise<Cart> =>
  request((init) => applyCartCoupon({ code }, params, init));

export const deleteCartCoupon = (params: CartParams): Promise<Cart> => request((init) => removeCartCoupon(params, init), { retry: true });

export const acceptCartChanges = (params: CartParams): Promise<Cart> => request((init) => acknowledgeCart(params, init), { retry: true });

export const mergeGuestCart = (items: { variantId: string; quantity: number }[], params: CartParams): Promise<Cart> =>
  request((init) => mergeCart({ items }, params, init), { retry: true });
