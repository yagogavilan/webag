'use client';

import { Package } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button, MessageState, QueryBoundary, SkeletonRows } from '@/components/ui';
import type { MerchantStore } from '@/lib/api/lojista';
import { isOnboarding } from '@/lib/lojista-access';
import { asRoute } from '@/lib/routes';
import { LojistaNoAccess } from '../loja/settings-screen';
import { useMerchant } from '../lojista/store-context';

/**
 * Dono, ou funcionário com a permissão "Catálogo e estoque" (`catalog`). `GET /stores/mine` ainda não devolve as
 * permissões do funcionário (pendência de contrato): lista vazia = desconhecido, a tela abre e a API decide (403/404).
 */
export function canEditCatalog(store: MerchantStore | null | undefined): boolean {
  if (store?.role === 'owner') return true;
  const permissions = store?.permissions ?? [];
  return permissions.length === 0 || permissions.includes('catalog');
}

/** Preço em massa e exclusão só do dono (onda-2 K1/K6, hipótese Z-4). */
export const isCatalogOwner = (store: MerchantStore | null | undefined): boolean => store?.role === 'owner';

/**
 * Porta de todas as telas do catálogo: carrega a loja (os quatro estados), confere a permissão e explica por que o
 * catálogo ainda está fechado (a API só libera com a loja aprovada: 409 `STORE_NOT_APPROVED`).
 */
export function CatalogGate({ children }: { children: (store: MerchantStore) => ReactNode }) {
  const router = useRouter();
  const { store: query } = useMerchant();
  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} height={72} label="Carregando a loja" />}>
      {(store) => {
        if (!store || isOnboarding(store)) {
          return (
            <MessageState icon={Package} title="O catálogo abre quando a sua loja for aprovada" text="Termine o cadastro e envie para análise." testId="lojista.catalog.closed" focusTitle>
              <Button onClick={() => router.push(asRoute('/lojista'))}>Voltar ao início</Button>
            </MessageState>
          );
        }
        if (!canEditCatalog(store)) return <LojistaNoAccess />;
        if (store.status !== 'approved' && store.status !== 'live') {
          const suspended = store.status === 'suspended';
          return (
            <MessageState
              icon={Package}
              title={suspended ? 'Sua loja está suspensa' : 'O catálogo abre quando a sua loja for aprovada'}
              text={suspended ? 'Enquanto durar a suspensão, o catálogo fica bloqueado.' : 'Você será avisado assim que o Webag aprovar.'}
              testId="lojista.catalog.closed"
              focusTitle
            >
              <Button onClick={() => router.push(asRoute('/lojista'))}>Voltar ao início</Button>
            </MessageState>
          );
        }
        return <>{children(store)}</>;
      }}
    </QueryBoundary>
  );
}
