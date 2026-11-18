import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Cart } from '@webag/shared';
import { useCallback, useEffect } from 'react';
import { acceptCartChanges, deleteCartCoupon, deleteCartItem, emptyCart, fetchCart, mergeGuestCart, putCartCoupon, putCartItem, type CartParams } from '../../api/cart-api';
import { ApiError } from '../../api/problem';
import { onSessionCleared, useSession } from '../../api/session';
import { useCurrentAddress } from '../address/store';
import { modeStore } from '../catalog/queries';
import { fromLocal, fromServer, type CartLine, type CartView } from './model';
import { cartActions, cartStore, useLocalCart, type NewItem } from './store';

export const cartKey = (params: CartParams) => ['cart', params.mode ?? 'delivery', params.addressId ?? null] as const;

/** Modo (entrega ou retirada) e, se o endereço atual já é da conta, o `addressId` para o frete exato. */
export function useCartParams(): CartParams {
  const mode = modeStore.useValue();
  const address = useCurrentAddress();
  return { mode, ...(address?.remote && address.precision === 'full' ? { addressId: address.id } : {}) };
}

export interface CartHook {
  view: CartView | null;
  /** Primeira carga da sacola da conta. */
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  authed: boolean;
}

/** A sacola atual: do servidor para quem tem conta, local para o visitante. */
export function useCartView(): CartHook {
  const session = useSession();
  const authed = session.status === 'authenticated';
  const params = useCartParams();
  const local = useLocalCart();
  const query = useQuery({ queryKey: cartKey(params), queryFn: ({ signal }) => fetchCart(params, signal), enabled: authed, staleTime: 15_000 });
  if (authed) {
    return { view: query.data ? fromServer(query.data) : null, isLoading: query.isLoading, isError: query.isError && !query.data, refetch: () => void query.refetch(), authed };
  }
  return { view: fromLocal(local), isLoading: false, isError: false, refetch: () => undefined, authed };
}

export function useCartCount(): number {
  return useCartView().view?.count ?? 0;
}

export type AddOutcome =
  | { kind: 'added'; adjustedTo?: number }
  | { kind: 'conflict'; currentStoreName: string; itemCount: number; confirm: () => Promise<AddOutcome> }
  | { kind: 'failed'; code: string; offline: boolean };

export interface AddArgs {
  storeId: string;
  storeName: string;
  item: NewItem;
}

/** Escritas da sacola. Conta: PUT absoluto no servidor (resposta já traz a sacola nova). Visitante: aparelho. */
export function useCartActions() {
  const client = useQueryClient();
  const session = useSession();
  const authed = session.status === 'authenticated';
  const params = useCartParams();
  const key = cartKey(params);

  const apply = useCallback(
    (cart: Cart): void => {
      client.setQueryData(key, cart);
    },
    [client, key],
  );

  const currentQuantity = useCallback(
    async (variantId: string): Promise<number> => {
      let cached = client.getQueryData<Cart>(key);
      cached ??= await client.fetchQuery({ queryKey: key, queryFn: () => fetchCart(params), staleTime: 5_000 });
      return cached.items.find((i) => i.variantId === variantId)?.quantity ?? 0;
    },
    [client, key, params],
  );

  const add = useCallback(
    async ({ storeId, storeName, item }: AddArgs): Promise<AddOutcome> => {
      if (!authed) {
        const result = await cartActions.add(storeId, storeName, item);
        if (result.kind === 'added') return { kind: 'added', ...(result.quantity < item.quantity ? { adjustedTo: result.quantity } : {}) };
        return {
          kind: 'conflict',
          currentStoreName: result.currentStoreName,
          itemCount: result.itemCount,
          confirm: async () => {
            await cartActions.replaceWith(storeId, storeName, item);
            return { kind: 'added' };
          },
        };
      }
      const send = async (replaceStore: boolean): Promise<AddOutcome> => {
        try {
          const existing = replaceStore ? 0 : await currentQuantity(item.variantId);
          const cart = await putCartItem(item.variantId, existing + item.quantity, params, replaceStore);
          apply(cart);
          const adjusted = cart.notices.find((n) => n.code === 'QUANTITY_ADJUSTED');
          return { kind: 'added', ...(adjusted?.appliedQuantity !== undefined ? { adjustedTo: adjusted.appliedQuantity } : {}) };
        } catch (error) {
          if (error instanceof ApiError && error.code === 'CART_STORE_CONFLICT') {
            const current = error.body.currentStore as { name?: string } | undefined;
            return {
              kind: 'conflict',
              currentStoreName: current?.name ?? '',
              itemCount: typeof error.body.itemCount === 'number' ? error.body.itemCount : 0,
              confirm: () => send(true),
            };
          }
          return { kind: 'failed', code: error instanceof ApiError ? error.code : 'UNKNOWN', offline: error instanceof ApiError && error.isConnectivity };
        }
      };
      return send(false);
    },
    [authed, apply, currentQuantity, params],
  );

  const setQuantity = useCallback(
    async (line: CartLine, quantity: number): Promise<void> => {
      if (!authed) return cartActions.setQuantity(line.key, quantity);
      apply(await putCartItem(line.variantId, quantity, params));
    },
    [authed, apply, params],
  );

  const remove = useCallback(
    async (line: CartLine): Promise<void> => {
      if (!authed) {
        await cartActions.remove(line.key);
        return;
      }
      apply(await deleteCartItem(line.variantId, params));
    },
    [authed, apply, params],
  );

  /** Desfazer "removido": põe a mesma quantidade de volta. */
  const restore = useCallback(
    async (view: CartView, line: CartLine): Promise<void> => {
      if (!authed) {
        await cartActions.restore(view.storeId, view.storeName, { key: line.key, variantId: line.variantId, productId: line.productId, name: line.name, variantLabel: line.variantLabel, urls: line.urls, unitPriceCents: line.unitPriceCents, originalPriceCents: line.originalPriceCents, quantity: line.quantity, maxQuantity: line.maxQuantity });
        return;
      }
      apply(await putCartItem(line.variantId, Math.max(1, line.quantity), params));
    },
    [authed, apply, params],
  );

  const clear = useCallback(async (): Promise<void> => {
    if (!authed) return cartActions.clear();
    apply(await emptyCart(params));
  }, [authed, apply, params]);

  const applyCoupon = useCallback(
    async (code: string): Promise<Cart> => {
      const cart = await putCartCoupon(code.trim(), params);
      apply(cart);
      return cart;
    },
    [apply, params],
  );
  const removeCoupon = useCallback(async (): Promise<void> => apply(await deleteCartCoupon(params)), [apply, params]);
  const acknowledge = useCallback(async (): Promise<void> => apply(await acceptCartChanges(params)), [apply, params]);

  return { add, setQuantity, remove, restore, clear, applyCoupon, removeCoupon, acknowledge };
}

/** Sacola da conta é dado da conta: some do cache em memória junto com a sessão (SEC-122). */
export function registerCartCleanup(client: QueryClient): () => void {
  return onSessionCleared(() => {
    client.removeQueries({ queryKey: ['cart'] });
  });
}

/**
 * Entrou na conta: a sacola montada como visitante é enviada ao servidor (`/v1/cart/merge`) e esvaziada aqui. Loja diferente
 * MANTÉM a da conta e avisa. Falha de rede deixa a sacola local intacta para tentar de novo na próxima abertura.
 */
export function useMergeGuestCart(onNotice: (message: string) => void): void {
  const session = useSession();
  const client = useQueryClient();
  const params = useCartParams();
  const userId = session.status === 'authenticated' ? session.user.id : null;
  const key = cartKey(params);
  useEffect(() => {
    if (!userId) return;
    const local = cartStore.get();
    if (local.items.length === 0) return;
    let cancelled = false;
    void mergeGuestCart(local.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), params)
      .then(async (cart) => {
        if (cancelled) return;
        client.setQueryData(key, cart);
        await cartStore.reset();
        const kept = cart.notices.find((n) => n.code === 'MERGE_KEPT_ACCOUNT_CART' || n.code === 'MERGE_ITEM_SKIPPED');
        if (kept) onNotice(kept.message);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // roda uma vez por login; os parâmetros da sacola não devem disparar novo envio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
