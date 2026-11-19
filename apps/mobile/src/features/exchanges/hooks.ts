import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelMyExchange, fetchExchange, fetchExchangeOptions, fetchExchangePayment, fetchExchanges } from '../../api/exchanges-api';
import { useSession } from '../../api/session';
import { isExchangeOpen } from './model';

export const exchangeKey = (id: string) => ['exchanges', 'detail', id] as const;
export const exchangeOptionsKey = (orderId: string) => ['exchanges', 'options', orderId] as const;

export function useExchangeOptions(orderId: string) {
  const session = useSession();
  return useQuery({ queryKey: exchangeOptionsKey(orderId), queryFn: ({ signal }) => fetchExchangeOptions(orderId, signal), enabled: session.status === 'authenticated', staleTime: 0 });
}

export function useExchanges() {
  const session = useSession();
  return useInfiniteQuery({
    queryKey: ['exchanges', 'list'],
    queryFn: ({ pageParam, signal }) => fetchExchanges(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: session.status === 'authenticated',
    staleTime: 15_000,
  });
}

/** Troca: REST é a fonte; o canal /rt avisa. Sem canal, leitura de 10 s enquanto a troca está aberta (fallback). */
export function useExchange(id: string, opts: { connected?: boolean } = {}) {
  const session = useSession();
  return useQuery({
    queryKey: exchangeKey(id),
    queryFn: ({ signal }) => fetchExchange(id, signal),
    enabled: session.status === 'authenticated',
    staleTime: 10_000,
    refetchInterval: (q) => (q.state.data && !isExchangeOpen(q.state.data.status) ? false : opts.connected ? 60_000 : 10_000),
  });
}

/** Pagamento da taxa: só leitura em polling até sair de `pending` (SEC-035). */
export function useExchangePayment(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['exchanges', 'payment', id],
    queryFn: ({ signal }) => fetchExchangePayment(id, signal),
    enabled,
    staleTime: 0,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'pending' && q.state.data.status !== 'pending_3ds' ? false : 4_000),
  });
}

export function useCancelExchange(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => cancelMyExchange(id),
    onSuccess: (x) => {
      client.setQueryData(exchangeKey(id), x);
      void client.invalidateQueries({ queryKey: ['exchanges', 'list'] });
    },
  });
}
