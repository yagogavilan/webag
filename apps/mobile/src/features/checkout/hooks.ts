import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Cart, Order } from '@webag/shared';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { acceptCartChanges, fetchCart, type CartParams } from '../../api/cart-api';
import { placeOrder } from '../../api/orders-api';
import { useSession } from '../../api/session';
import { useCurrentAddress } from '../address/store';
import { cartKey } from '../cart/hooks';
import { useLocalCart } from '../cart/store';
import { toCheckoutFailure, type CheckoutFailure } from './errors';
import { keyFor, type KeyHolder } from './idempotency';
import { addressIsReady, buildOrderBody, type OrderDraft, type ReceiveMode } from './state';

export const orderKey = (id: string) => ['orders', 'detail', id] as const;
export const paymentKey = (id: string) => ['orders', 'payment', id] as const;

/** Parâmetros da sacola neste checkout: o modo é LOCAL da tela (não muda o modo de navegação do início). */
export function useCheckoutParams(mode: ReceiveMode): CartParams {
  const address = useCurrentAddress();
  return { mode, ...(addressIsReady(address) && address ? { addressId: address.id } : {}) };
}

/** Sacola do servidor para o checkout: reconfere preço, estoque, horário e frete a cada abertura (RN-05). */
export function useCheckoutCart(mode: ReceiveMode) {
  const session = useSession();
  const authed = session.status === 'authenticated';
  const params = useCheckoutParams(mode);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: cartKey(params),
    queryFn: ({ signal }) => fetchCart(params, signal),
    enabled: authed,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const apply = useCallback((cart: Cart) => client.setQueryData(cartKey(params), cart), [client, params]);
  const accept = useCallback(async (): Promise<Cart> => {
    const cart = await acceptCartChanges(params);
    apply(cart);
    return cart;
  }, [apply, params]);
  return { authed, params, cart: query.data, isLoading: query.isLoading, isError: query.isError && !query.data, checkFailed: query.isError && Boolean(query.data), isFetching: query.isFetching, refetch: () => void query.refetch(), apply, accept };
}

/**
 * Logo depois de entrar, a sacola de visitante ainda está subindo para a conta (`/v1/cart/merge`). Enquanto houver item local,
 * o checkout espera: senão leria uma sacola vazia do servidor e mandaria o cliente de volta ao início.
 */
export function useGuestMergePending(): boolean {
  const session = useSession();
  const local = useLocalCart();
  return session.status === 'authenticated' && local.items.length > 0;
}

export type SubmitResult = { ok: true; order: Order } | { ok: false; failure: CheckoutFailure } | { ok: false; ignored: true };

/**
 * Envio do pedido. Um toque por vez (`inFlight`) E chave de idempotência estável por corpo: toque duplo ou repetição em rede
 * ruim nunca criam dois pedidos nem duas cobranças. "Ainda gerando" aparece depois de 6 s (spec S3).
 */
export function useSubmitOrder() {
  const client = useQueryClient();
  const holder = useRef<KeyHolder | null>(null);
  const inFlight = useRef(false);
  const [slow, setSlow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutation = useMutation({
    mutationFn: ({ cart, draft }: { cart: Cart; draft: OrderDraft }) => {
      const body = buildOrderBody(cart, draft);
      holder.current = keyFor(holder.current, body, Crypto.randomUUID);
      return placeOrder(body, holder.current.key);
    },
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const submit = useCallback(
    async (cart: Cart, draft: OrderDraft): Promise<SubmitResult> => {
      if (inFlight.current) return { ok: false, ignored: true };
      inFlight.current = true;
      setSlow(false);
      timer.current = setTimeout(() => setSlow(true), 6000);
      try {
        const order = await mutation.mutateAsync({ cart, draft });
        holder.current = null;
        client.setQueryData(orderKey(order.id), order);
        void client.invalidateQueries({ queryKey: ['orders', 'list'] });
        void client.invalidateQueries({ queryKey: ['cart'] });
        return { ok: true, order };
      } catch (error) {
        const failure = toCheckoutFailure(error);
        // A chave "grudou" num corpo que o servidor já conhece: a próxima tentativa começa com chave nova
        if (failure.kind === 'key-reused' || failure.kind === 'declined') holder.current = null;
        return { ok: false, failure };
      } finally {
        if (timer.current) clearTimeout(timer.current);
        setSlow(false);
        inFlight.current = false;
      }
    },
    [client, mutation],
  );

  return { submit, submitting: mutation.isPending, slow };
}
