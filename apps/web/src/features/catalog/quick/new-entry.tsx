'use client';

import { Package, WifiSlash } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, ButtonLink, MessageState, SkeletonRows } from '@/components/ui';
import { catalogApi, catalogErrorMessage } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { QUICK_MESSAGES, newIntentKey } from '@/lib/catalog/quick';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { CatalogGate } from '../catalog-gate';

const T = (id: string) => ltid('rapido', id);
const intentStore = (storeId: string) => `webag:lojista:novo-intent:${storeId}`;

/** Chave da intenção "Novo produto": recarregar esta tela não cria um segundo rascunho (mesma chave, mesmo rascunho). */
function intentKey(storeId: string): string {
  try {
    const saved = sessionStorage.getItem(intentStore(storeId));
    if (saved) return saved;
    const created = newIntentKey('novo');
    sessionStorage.setItem(intentStore(storeId), created);
    return created;
  } catch {
    return newIntentKey('novo');
  }
}

/**
 * `/lojista/produtos/novo` (WB-370 C1, C8; spec §0 #2): o rascunho nasce ANTES da câmera, no servidor, com só o `via` (WB-379: o front
 * informa a via e nada mais; sem sessão, sem texto do produto). Depois leva à tela do rascunho, que tenta abrir a câmera.
 * Sem internet nada é criado: botão inerte com o motivo escrito.
 */
export function NewProductEntry() {
  return <CatalogGate>{(store) => <Entry storeId={store.id} />}</CatalogGate>;
}

export function Entry({ storeId }: { storeId: string }) {
  const router = useRouter();
  const online = useOnline();
  const [tapped, setTapped] = useState(false);
  const create = useMutation({
    mutationFn: () => catalogApi.createDraft(storeId, { via: 'camera' }, intentKey(storeId)),
    onSuccess: (draft) => {
      try {
        sessionStorage.removeItem(intentStore(storeId));
      } catch {
        /* sem armazenamento: a próxima intenção gera outra chave de qualquer forma */
      }
      router.replace(asRoute(`/lojista/produtos/novo/${draft.id}?camera=1`));
    },
  });

  useEffect(() => {
    // `isIdle`: uma vez por visita (o modo estrito do React roda o efeito duas vezes, e a chave estável também protege).
    if (online && create.isIdle) create.mutate();
  }, [online, create]);

  if (!online && !create.isPending) {
    return (
      <MessageState icon={WifiSlash} title="Sem internet" text={QUICK_MESSAGES.offlineNew} testId={T('entry-offline')} role="alert">
        <Button aria-disabled="true" onClick={() => setTapped(true)}>Tentar de novo</Button>
        {tapped ? <p role="alert" className="wb-text-body">{QUICK_MESSAGES.offlineNew}</p> : null}
      </MessageState>
    );
  }
  if (create.isError) {
    const error = create.error;
    const limit = error instanceof ApiError && error.code === 'DRAFT_LIMIT_REACHED';
    const message = error instanceof ApiError && error.isNetwork ? QUICK_MESSAGES.offlineNew : catalogErrorMessage(error, 'Não conseguimos criar o produto agora. Tente de novo.');
    return (
      <MessageState icon={Package} title={limit ? 'Limite de rascunhos' : 'Não foi possível começar'} text={message} testId={T('entry-error')} role="alert">
        {limit ? <ButtonLink href={asRoute('/lojista/produtos?filtro=draft')}>Ver rascunhos</ButtonLink> : <Button onClick={() => create.mutate()}>Tentar de novo</Button>}
      </MessageState>
    );
  }
  return <SkeletonRows rows={3} height={64} label="Preparando o cadastro" />;
}
