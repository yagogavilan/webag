import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Order } from '@webag/shared';
import { cancelMyOrder, fetchOrders, type OrderScope } from '../../api/orders-api';
import { useSession } from '../../api/session';
import { orderKey } from '../checkout/hooks';

export const ordersListKey = (scope: OrderScope) => ['orders', 'list', scope] as const;

/** Meus pedidos, por cursor (20 por página). Só com sessão: visitante vê o convite para entrar, sem chamada. */
export function useOrdersList(scope: OrderScope, opts: { connected?: boolean } = {}) {
  const session = useSession();
  return useInfiniteQuery({
    queryKey: ordersListKey(scope),
    queryFn: ({ pageParam, signal }) => fetchOrders(scope, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: session.status === 'authenticated',
    staleTime: 15_000,
    // Em andamento: leitura de segurança enquanto o canal em tempo real estiver caído
    refetchInterval: scope === 'active' ? (opts.connected ? 60_000 : 15_000) : false,
  });
}

/** Cancelar (RN-08). Idempotente no servidor; o botão fica inerte enquanto envia (toque duplo = um cancelamento). */
export function useCancelOrder(orderId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => cancelMyOrder(orderId, reason),
    onSuccess: (order: Order) => {
      client.setQueryData(orderKey(orderId), order);
      void client.invalidateQueries({ queryKey: ['orders', 'list'] });
    },
  });
}
