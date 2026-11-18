'use client';

import { Lock } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button, MessageState, QueryBoundary, SkeletonRows } from '@/components/ui';
import type { MerchantStore } from '@/lib/api/lojista';
import { settingsApi, settingsKeys, type StoreSettings } from '@/lib/api/store-settings';
import { isOnboarding, isOwner } from '@/lib/lojista-access';
import { asRoute } from '@/lib/routes';
import { useMerchant } from '../lojista/store-context';

interface Ctx {
  store: MerchantStore;
  settings: StoreSettings;
  /** Atualiza o cache depois de salvar e volta o toast "Alterações salvas." na tela do menu. */
  refresh: () => Promise<unknown>;
}

/** Funcionário não vê "Minha loja" (onda-2 C1): sem acesso, com o texto do lojista. */
export function LojistaNoAccess() {
  const router = useRouter();
  return (
    <MessageState icon={Lock} title="Você não tem acesso a essa área" text="Peça ao dono da loja para liberar." testId="no-access" focusTitle>
      <Button onClick={() => router.push(asRoute('/lojista'))}>Voltar ao painel</Button>
    </MessageState>
  );
}

/** Carrega a loja e a configuração (carregando, erro, sem conexão e sem acesso) antes de desenhar o formulário. */
export function SettingsScreen({ children }: { children: (ctx: Ctx) => ReactNode }) {
  const router = useRouter();
  const client = useQueryClient();
  const { store: storeQuery } = useMerchant();
  const store = storeQuery.data ?? null;
  const owner = isOwner(store);
  const settings = useQuery({ queryKey: settingsKeys.settings(store?.id ?? ''), queryFn: () => settingsApi.get(store!.id), enabled: Boolean(store) && owner });

  useEffect(() => {
    if (storeQuery.data !== undefined && isOnboarding(storeQuery.data) && owner !== false) router.replace(asRoute('/lojista'));
  }, [storeQuery.data, owner, router]);

  if (store && !owner) return <LojistaNoAccess />;
  return (
    <QueryBoundary query={storeQuery} skeleton={<SkeletonRows rows={5} height={56} label="Carregando a loja" />}>
      {(loaded) =>
        !loaded || isOnboarding(loaded) ? (
          <SkeletonRows rows={2} height={56} />
        ) : (
          <QueryBoundary query={settings} skeleton={<SkeletonRows rows={6} height={56} label="Carregando as configurações" />}>
            {(data) => children({ store: loaded, settings: data, refresh: () => client.invalidateQueries({ queryKey: ['lojista'] }) })}
          </QueryBoundary>
        )
      }
    </QueryBoundary>
  );
}
