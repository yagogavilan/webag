'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/panel/session-context';
import { NoAccessState, QueryBoundary, SkeletonRows } from '@/components/ui';
import { adminStoresApi, storeKeys } from '@/lib/api/admin-stores';
import { ApprovalCase } from './approval-case';
import { StoreDetail } from './store-detail';

/** Uma loja no admin: em análise abre o caso de aprovação (A2); nos demais estados, o detalhe (A3). */
export function StoreCasePage({ storeId }: { storeId: string }) {
  const { canView } = useSession();
  const allowed = canView('lojas');
  const query = useQuery({ queryKey: storeKeys.detail(storeId), queryFn: () => adminStoresApi.detail(storeId), enabled: allowed });
  if (!allowed) return <NoAccessState />;
  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={5} height={64} label="Carregando a loja" />}>
      {(detail) => (detail.store.status === 'in_review' ? <ApprovalCase detail={detail} /> : <StoreDetail detail={detail} />)}
    </QueryBoundary>
  );
}
