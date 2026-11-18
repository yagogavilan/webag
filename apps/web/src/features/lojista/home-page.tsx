'use client';

import { QueryBoundary } from '@/components/ui';
import { PageHeader } from '@/components/panel/page-header';
import { useMerchant } from './store-context';

export function LojistaHome() {
  const { store } = useMerchant();
  return (
    <>
      <PageHeader title="Início" />
      <QueryBoundary query={store}>{(data) => <p className="wb-text-body">{data?.name ?? 'Sua loja'}</p>}</QueryBoundary>
    </>
  );
}
