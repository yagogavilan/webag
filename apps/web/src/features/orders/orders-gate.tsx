'use client';

import { Receipt } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button, MessageState, QueryBoundary, SkeletonRows } from '@/components/ui';
import type { MerchantStore } from '@/lib/api/lojista';
import { canManageOrders } from '@/lib/lojista-access';
import { asRoute } from '@/lib/routes';
import { LojistaNoAccess } from '../loja/settings-screen';
import { useMerchant } from '../lojista/store-context';

/** Porta das telas de pedidos: carrega a loja, confere a permissão "Pedidos" e explica por que ainda não há pedidos. */
export function OrdersGate({ children }: { children: (store: MerchantStore) => ReactNode }) {
  const router = useRouter();
  const { store: query } = useMerchant();
  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={4} height={96} label="Carregando a loja" />}>
      {(store) => {
        if (store && !canManageOrders(store)) return <LojistaNoAccess />;
        if (!store || (store.status !== 'approved' && store.status !== 'live' && store.status !== 'suspended')) {
          return (
            <MessageState icon={Receipt} title="Os pedidos abrem quando a sua loja for aprovada" text="Termine o cadastro e envie para análise. Avisamos com som quando o primeiro pedido chegar." testId="lojista.orders.closed" focusTitle>
              <Button onClick={() => router.push(asRoute('/lojista'))}>Voltar ao início</Button>
            </MessageState>
          );
        }
        return <>{children(store)}</>;
      }}
    </QueryBoundary>
  );
}
