'use client';

import { ChatCircleText, Star } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Banner, Button, Dialog, EmptyState, ErrorState, SkeletonRows, TextArea, cx, ui, useToast } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import { LojistaNoAccess } from '@/features/loja/settings-screen';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { REPLY_MAX, reviewsApi, reviewsKeys, type ReviewFilter, type StoreReview } from '@/lib/api/reviews';
import { formatDay } from '@/lib/format';
import { canReplyReviews } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { ReviewsSummaryCard } from './reviews-summary';
import s from './reviews.module.css';

const T = (id: string) => ltid('avaliacoes', id);
type FilterId = 'all' | 'pending' | 'replied';
const FILTERS: { id: FilterId; label: string; filter: ReviewFilter }[] = [
  { id: 'all', label: 'Todas', filter: {} },
  { id: 'pending', label: 'Sem resposta', filter: { replied: false } },
  { id: 'replied', label: 'Respondidas', filter: { replied: true } },
];
const FIT_LABEL = { small: 'Veio pequeno', ok: 'Serviu bem', large: 'Veio grande' } as const;

export const stars = (rating: number): string => `${rating} de 5 estrelas`;

/** Mensagem de erro da resposta (400 de validação, 403 sem permissão, 404 avaliação removida, 429 limite). */
export function replyError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para responder. O texto continua aqui.';
    if (caught.status === 404) return 'Essa avaliação não está mais disponível.';
    if (caught.status === 403) return 'Você não tem permissão para responder avaliações.';
    if (caught.status === 429) return 'Muitas respostas em pouco tempo. Tente de novo em alguns minutos.';
  }
  return saveErrorMessage(caught, 'Não foi possível publicar. O texto continua aqui.');
}

/** WB-195: avaliações da loja e resposta pública. Só o dono ou quem tem a permissão "Avaliações". */
export function ReviewsPage() {
  const { store: query } = useMerchant();
  const store = query.data;
  if (query.isPending) return <SkeletonRows rows={3} height={120} label="Carregando as avaliações" />;
  if (!store || !canReplyReviews(store)) return <LojistaNoAccess />;
  return <Reviews storeId={store.id} />;
}

function Reviews({ storeId }: { storeId: string }) {
  const online = useOnline();
  const [filterId, setFilterId] = useState<FilterId>('all');
  const filter = FILTERS.find((f) => f.id === filterId)!.filter;
  const query = useInfiniteQuery({
    queryKey: reviewsKeys.list(storeId, filter),
    queryFn: ({ pageParam }) => reviewsApi.list(storeId, filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];

  let body;
  if (query.isPending) body = <SkeletonRows rows={3} height={120} label="Carregando as avaliações" />;
  else if (query.isError && !query.data) {
    body = query.error instanceof ApiError && query.error.status === 403 ? <LojistaNoAccess /> : <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} testId={T('error')} />;
  } else if (rows.length === 0) {
    body = <EmptyState icon={Star} title={filterId === 'pending' ? 'Nenhuma avaliação sem resposta' : filterId === 'replied' ? 'Você ainda não respondeu nenhuma avaliação' : 'Ainda não há avaliações'} text={filterId === 'all' ? 'Quando um cliente avaliar um pedido entregue, a avaliação aparece aqui.' : 'Troque o filtro para ver as outras.'} actionLabel={filterId === 'all' ? undefined : 'Ver todas'} onAction={() => setFilterId('all')} testId={T('empty')} />;
  } else {
    body = (
      <>
        <ul className={s.list} aria-label="Avaliações" data-testid={T('list')}>
          {rows.map((review) => (
            <ReviewCard key={review.id} storeId={storeId} review={review} online={online} />
          ))}
        </ul>
        {query.hasNextPage ? (
          <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('more')}>Ver mais avaliações</Button>
        ) : null}
        {query.isFetchNextPageError ? <Banner tone="danger">Não conseguimos carregar mais. Tente de novo.</Banner> : null}
      </>
    );
  }

  return (
    <div className={s.page}>
      <PageHeader title="Avaliações" description="O que os clientes disseram e as suas respostas." />
      {!online ? <Banner tone="warning" offline>Sem conexão. Mostrando o que já carregou.</Banner> : null}
      <ReviewsSummaryCard storeId={storeId} variant="page" />
      <div className={s.chips} role="group" aria-label="Filtrar avaliações">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={cx(s.chip, filterId === f.id && s.chipOn, 'wb-text-body-strong')} aria-pressed={filterId === f.id} onClick={() => setFilterId(f.id)} data-testid={T(`filter-${f.id}`)}>
            {f.label}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}

function ReviewCard({ storeId, review, online }: { storeId: string; review: StoreReview; online: boolean }) {
  const client = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.storeReply ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: reviewsKeys.all(storeId) });

  async function publish() {
    const value = text.trim();
    if (value.length === 0) return setError('Escreva a resposta.');
    if (!online) return setError('Conecte-se para responder. O texto continua aqui.');
    setBusy(true);
    setError(null);
    try {
      await reviewsApi.reply(storeId, review.id, value);
      await refresh();
      toast.show(review.storeReply ? 'Resposta atualizada.' : 'Resposta publicada.');
      setEditing(false);
    } catch (caught) {
      setError(replyError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await reviewsApi.removeReply(storeId, review.id);
      await refresh();
      toast.show('Resposta apagada.');
      setRemoving(false);
      setText('');
    } catch (caught) {
      setError(replyError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={s.card} data-testid={T(`review-${review.id}`)}>
      <div className={s.cardTop}>
        <span className={cx('wb-text-body-strong', s.rating)} role="img" aria-label={stars(review.rating)} data-testid={T(`rating-${review.id}`)}>
          {Array.from({ length: 5 }, (_, i) => <Star key={i} size={20} weight={i < review.rating ? 'fill' : 'regular'} aria-hidden="true" />)}
        </span>
        <span className="wb-text-caption">{review.reviewer} · {formatDay(review.createdAt)}</span>
      </div>
      <p className={cx('wb-text-caption', s.muted)}>{review.target.type === 'store' ? 'Sobre a loja' : `Sobre o produto ${review.target.name ?? ''}`}{review.fit ? ` · ${FIT_LABEL[review.fit]}` : ''}</p>
      <p className="wb-text-body" style={{ margin: 0 }}>{review.comment ?? 'O cliente não escreveu comentário.'}</p>
      {editing ? (
        <div className={ui.stack}>
          <TextArea label="Sua resposta" value={text} onChange={(e) => setText(e.target.value.slice(0, REPLY_MAX))} counter={{ value: text.length, max: REPLY_MAX }} rows={3} hint="A resposta é pública e aparece para todos os clientes. Não coloque telefone nem dados pessoais." data-testid={T(`reply-input-${review.id}`)} />
          {error ? <Banner tone="danger" testId={T(`reply-error-${review.id}`)}>{error}</Banner> : null}
          <div className={s.actions}>
            <Button onClick={() => void publish()} loading={busy} loadingLabel="Publicando…" disabled={!online} data-testid={T(`reply-submit-${review.id}`)}>{review.storeReply ? 'Salvar resposta' : 'Publicar resposta'}</Button>
            <Button variant="text" onClick={() => { setEditing(false); setError(null); setText(review.storeReply ?? ''); }} disabled={busy}>Cancelar</Button>
          </div>
        </div>
      ) : review.storeReply ? (
        <div className={s.reply} data-testid={T(`reply-${review.id}`)}>
          <p className="wb-text-caption-strong" style={{ margin: 0 }}>Sua resposta{review.storeRepliedAt ? ` · ${formatDay(review.storeRepliedAt)}` : ''}</p>
          <p className="wb-text-body" style={{ margin: 0 }}>{review.storeReply}</p>
          <div className={s.actions}>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} data-testid={T(`reply-edit-${review.id}`)}>Editar</Button>
            <Button variant="text" size="sm" onClick={() => setRemoving(true)} data-testid={T(`reply-delete-${review.id}`)}>Apagar resposta</Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" size="sm" icon={<ChatCircleText size={20} aria-hidden="true" />} onClick={() => setEditing(true)} data-testid={T(`reply-open-${review.id}`)}>Responder</Button>
        </div>
      )}
      {removing ? (
        <Dialog title="Apagar a resposta?" onClose={() => setRemoving(false)} locked={busy} testId={T('delete-dialog')} actions={<><Button variant="destructive" loading={busy} loadingLabel="Apagando…" onClick={() => void remove()} data-testid={T('delete-confirm')}>Apagar resposta</Button><Button variant="text" onClick={() => setRemoving(false)} disabled={busy}>Cancelar</Button></>}>
          <p className="wb-text-body" style={{ margin: 0 }}>A resposta deixa de aparecer para os clientes. A avaliação continua.</p>
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </Dialog>
      ) : null}
    </li>
  );
}
