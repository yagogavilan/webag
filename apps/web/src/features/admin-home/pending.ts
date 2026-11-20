'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi, type PendingCounts } from '@/lib/api/admin';

export const pendingKey = ['admin', 'overview', 'pending'] as const;

/** Contagens de pendência por área (W.7): Início e contadores da barra usam a mesma consulta. Erro é silencioso: sem número, sem contador. */
export function usePendingCounts(): PendingCounts | null {
  const query = useQuery({ queryKey: pendingKey, queryFn: () => adminApi.pending(), refetchInterval: 60_000, refetchIntervalInBackground: false, retry: 1 });
  return query.data ?? null;
}
