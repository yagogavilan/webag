'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { useSession } from '@/components/panel/session-context';
import { logisticsApi, logisticsKeys } from '@/lib/api/logistics';
import { useRealtimeChannel } from '@/lib/realtime/use-realtime-channel';

const ChannelContext = createContext(false);

/**
 * Um único canal em tempo real (ticket, escopo admin) para o painel inteiro. O evento `delivery_ready` refaz a leitura da fila e o
 * polling cai para 60 s; sem o canal (fallback), 15 s. O contador do menu e a tela da logística usam a mesma consulta: por isso o canal fica aqui.
 */
export function AdminRealtimeProvider({ children }: { children: ReactNode }) {
  const { canView } = useSession();
  const enabled = canView('logistica');
  const client = useQueryClient();
  const { connected } = useRealtimeChannel({ area: 'admin', target: { scope: 'admin' }, enabled, onEvent: () => void client.invalidateQueries({ queryKey: logisticsKeys.queue }) });
  return <ChannelContext.Provider value={connected}>{children}</ChannelContext.Provider>;
}

/** Contador de "pronto para coleta" no menu (a mesma consulta da tela, em cache compartilhado). */
export function useWaitingForCourier() {
  const { canView } = useSession();
  const enabled = canView('logistica');
  const connected = useContext(ChannelContext);
  const query = useQuery({ queryKey: logisticsKeys.queue, queryFn: () => logisticsApi.deliveries({ tab: 'active', limit: 50 }), enabled, refetchInterval: connected ? 60_000 : 15_000, refetchIntervalInBackground: true });
  const rows = query.data?.data ?? [];
  return { query, waiting: rows.filter((row) => row.status === 'ready_for_collection') };
}
