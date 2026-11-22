'use client';

import { FileDashed, Trash } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, ButtonLink, Dialog, ErrorState, MessageState, SkeletonRows, cx, ui, useToast } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type ProductDraftSummary } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { QUICK_MESSAGES, missingText, savedAgo } from '@/lib/catalog/quick';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { Thumb } from '../product-row';
import { NewProductLink } from './new-product-link';
import { useDuplicate } from './use-duplicate';
import q from './quick.module.css';

const T = (id: string) => ltid('rascunhos', id);

/** Aba "Rascunhos (n)" (WB-371 C1 a C6, WB-372): separados dos ativos, com o que falta, o vencimento e as ações. Nunca aparecem ao cliente. */
export function DraftsPanel({ storeId }: { storeId: string }) {
  const online = useOnline();
  const list = useInfiniteQuery({
    queryKey: catalogKeys.drafts(storeId),
    queryFn: ({ pageParam }) => catalogApi.drafts(storeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const dup = useDuplicate(storeId);
  const drafts = list.data?.pages.flatMap((page) => page.data) ?? [];
  const first = list.data?.pages[0];
  const count = first?.count ?? drafts.length;
  const limit = first?.limit ?? 100;

  if (list.isPending) return <SkeletonRows rows={4} height={72} label="Carregando os rascunhos" />;
  if (list.isError && !list.data) return <ErrorState offline={!online || (list.error instanceof ApiError && list.error.isNetwork)} onRetry={() => void list.refetch()} />;
  if (drafts.length === 0) {
    return (
      <MessageState icon={FileDashed} title="Nenhum rascunho" text="Quando você começar um produto e não publicar, ele fica aqui." testId={T('empty')}>
        <NewProductLink testId={T('new')} />
      </MessageState>
    );
  }
  return (
    <div className={ui.stack} data-testid={T('panel')}>
      <h2 className="wb-text-title2" style={{ margin: 0 }}>Rascunhos ({count})</h2>
      {count >= limit ? <Banner tone="warning" testId={T('limit')}>Limite de {limit} rascunhos. Publique ou apague algum para criar outro.</Banner> : null}
      {dup.error ? <Banner tone="danger" testId={T('dup-error')}>{dup.error}</Banner> : null}
      <ul className={q.draftList}>
        {drafts.map((draft) => (
          <DraftItem key={draft.id} storeId={storeId} draft={draft} onDuplicate={() => void dup.duplicate(draft.id)} duplicating={dup.busyId === draft.id} />
        ))}
      </ul>
      {list.hasNextPage ? (
        <Button variant="secondary" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} loadingLabel="Carregando…">Mostrar mais</Button>
      ) : null}
      <div><NewProductLink variant="secondary" testId={T('new')} /></div>
    </div>
  );
}

function DraftItem({ storeId, draft, onDuplicate, duplicating }: { storeId: string; draft: ProductDraftSummary; onDuplicate: () => void; duplicating: boolean }) {
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState<'publish' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ready = draft.missing.length === 0;
  const title = draft.name.trim() || 'Sem nome';

  async function publish() {
    if (!online) return setError(QUICK_MESSAGES.offlineTap);
    setBusy('publish');
    setError(null);
    try {
      await catalogApi.publish(storeId, draft.id);
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show(`${title} publicado.`);
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'Não conseguimos publicar agora. O rascunho continua aqui.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!online) {
      setConfirming(false);
      return setError(QUICK_MESSAGES.offlineTap);
    }
    setBusy('delete');
    try {
      try {
        await catalogApi.archive(storeId, draft.id);
      } catch (caught) {
        // Repetir o "Apagar" (resposta perdida, toque duplo) devolve 404: o rascunho já não existe, que era o objetivo (BUG-045).
        if (!(caught instanceof ApiError && caught.status === 404)) throw caught;
      }
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show('Rascunho apagado.');
      setConfirming(false);
    } catch (caught) {
      setConfirming(false);
      setError(catalogErrorMessage(caught, 'Não conseguimos apagar agora. Tente de novo.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className={q.draftItem} data-testid={T(`item-${draft.id}`)}>
      <Thumb cover={draft.cover} />
      <div className={q.draftText}>
        <p className={cx('wb-text-body-strong', q.draftName)} style={{ margin: 0 }}>{title}</p>
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>
          {missingText(draft.missing)} · {savedAgo(draft.updatedAt)}
        </p>
        {draft.expiresInDays <= 3 ? (
          <p className={cx('wb-text-caption-strong', q.rowErr)} style={{ margin: 0 }} data-testid={T(`expires-${draft.id}`)}>
            Será apagado em {draft.expiresInDays} {draft.expiresInDays === 1 ? 'dia' : 'dias'}
          </p>
        ) : null}
        {error ? <p role="alert" className={cx('wb-text-caption', q.rowErr)} data-testid={T(`error-${draft.id}`)}>{error}</p> : null}
      </div>
      <div className={q.draftActions}>
        {ready ? (
          <Button size="sm" loading={busy === 'publish'} loadingLabel="Publicando…" aria-disabled={!online || undefined} onClick={() => void publish()} aria-label={`Publicar ${title}`} data-testid={T(`publish-${draft.id}`)}>Publicar</Button>
        ) : (
          <ButtonLink href={asRoute(`/lojista/produtos/novo/${draft.id}`)} size="sm" aria-label={`Continuar ${title}`} data-testid={T(`continue-${draft.id}`)}>Continuar</ButtonLink>
        )}
        <Button variant="secondary" size="sm" loading={duplicating} loadingLabel="Duplicando…" aria-disabled={!online || undefined} onClick={onDuplicate} aria-label={`Duplicar ${title}`} data-testid={T(`duplicate-${draft.id}`)}>Duplicar</Button>
        <Button variant="text" size="sm" icon={<Trash size={16} aria-hidden="true" />} onClick={() => setConfirming(true)} aria-label={`Apagar o rascunho ${title}`} data-testid={T(`delete-${draft.id}`)}>Apagar</Button>
      </div>
      {confirming ? (
        <Dialog
          title="Apagar este rascunho?"
          onClose={() => setConfirming(false)}
          locked={busy === 'delete'}
          actions={
            <>
              <Button variant="destructive" loading={busy === 'delete'} loadingLabel="Apagando…" onClick={() => void remove()} data-testid={T(`delete-confirm-${draft.id}`)}>Apagar rascunho</Button>
              <Button variant="text" onClick={() => setConfirming(false)}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body">{title} sai da lista. Isso não dá para desfazer.</p>
        </Dialog>
      ) : null}
    </li>
  );
}
