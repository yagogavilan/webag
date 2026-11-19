import { useQuery } from '@tanstack/react-query';
import type { MaintenanceStatus } from '@webag/shared';
import { fetchMaintenance } from '../../api/config-api';
import { isMaintenanceOn } from './model';

export const maintenanceKey = ['config', 'maintenance'] as const;

/** Estado da manutenção para o aviso da sacola e do checkout. Erro é silencioso: sem resposta, sem aviso (nunca bloqueia o app). */
export function useMaintenance(): MaintenanceStatus | null {
  const query = useQuery({
    queryKey: maintenanceKey,
    queryFn: ({ signal }) => fetchMaintenance(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  return isMaintenanceOn(query.data) ? query.data : null;
}
