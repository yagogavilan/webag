'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/panel/session-context';
import { logisticsApi, logisticsKeys } from '@/lib/api/logistics';
import s from '@/components/panel/shell.module.css';

/** Contador de "pronto para coleta" no menu. Consulta a cada 15 s (a mesma consulta da tela, em cache compartilhado). */
export function useWaitingForCourier() {
  const { canView } = useSession();
  const enabled = canView('logistica');
  const query = useQuery({ queryKey: logisticsKeys.queue, queryFn: () => logisticsApi.deliveries({ tab: 'active', limit: 50 }), enabled, refetchInterval: 15_000, refetchIntervalInBackground: true });
  const rows = query.data?.data ?? [];
  return { query, waiting: rows.filter((row) => row.status === 'ready_for_collection') };
}

export function LogisticsNavCount() {
  const { waiting } = useWaitingForCourier();
  if (waiting.length === 0) return null;
  return (
    <span className={s.navCount} aria-label={`${waiting.length} esperando motoboy`} data-testid="admin.logistica.nav-count">
      {waiting.length}
    </span>
  );
}
