'use client';

import { ArrowsClockwise, Warning, WarningCircle } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Banner, Button, Dialog, EmptyState, ErrorState, RadioCards, SafeImage, SkeletonRows, Tabs, TextArea, cx, useToast } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import { LojistaNoAccess } from '@/features/loja/settings-screen';
import { ApiError } from '@/lib/api/errors';
import { EXCHANGE_STATUS_LABEL, EXCHANGE_TYPE_LABEL, answerRemainingMs, deadlineTone, exchangesApi, exchangesKeys, formatDeadline, type Exchange, type ExchangeScope } from '@/lib/api/exchanges';
import { attributesText } from '@/lib/orders/status';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { useOnline } from '@/lib/use-online';
import s from './exchanges.module.css';

const T = (id: string) => ltid('trocas', id);

const REJECT_REASONS = [
  { value: 'wear', label: 'Produto com sinais de uso' },
  { value: 'tag', label: 'Sem etiqueta ou embalagem' },
  { value: 'different', label: 'Item diferente do vendido' },
  { value: 'late', label: 'Fora do prazo' },
  { value: 'other', label: 'Outro' },
] as const;
type RejectReason = (typeof REJECT_REASONS)[number]['value'];

const SCOPES: { id: ExchangeScope; label: string; testId: string }[] = [
  { id: 'pending', label: 'Para responder', testId: T('tab-pending') },
  { id: 'in_progress', label: 'Em andamento', testId: T('tab-open') },
  { id: 'history', label: 'Concluídas', testId: T('tab-done') },
];

/** Decisões da loja sobre a troca. Cada uma devolve a mensagem de erro (ou `null`) e relê a fila; sem diálogo de confirmação para aprovar (TL1). */
export function useExchangeActions(storeId: string) {
  const client = useQueryClient();
  const toast = useToast();
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const run = useCallback(
    async (id: string, call: () => Promise<unknown>, success: string): Promise<string | null> => {
      if (inFlight.current.has(id)) return 'Aguarde: a troca está sendo atualizada.';
      inFlight.current.add(id);
      setBusy(new Set(inFlight.current));
      try {
        await call();
        toast.show(success);
        return null;
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.isNetwork) return 'Conecte-se para decidir. A troca continua esperando.';
          if (error.code === 'EXCHANGE_NO_STOCK') return 'Sem estoque do tamanho pedido. Aprove como reembolso ou recuse.';
          if (error.code === 'EXCHANGE_CANNOT_REJECT') return 'Desistência por lei não pode ser recusada.';
          if (error.code === 'EXCHANGE_CODE_LOCKED') return 'Muitos códigos errados. Peça ajuda ao Webag.';
          if (error.status === 409) return 'A Webag já decidiu esta troca. Atualizamos a tela.';
          if (error.status === 403) return 'Você não tem permissão para esta ação.';
          if (error.status === 422 && error.detail) return error.detail;
        }
        return 'Não foi possível salvar. Sua decisão não foi perdida. Tente de novo.';
      } finally {
        inFlight.current.delete(id);
        setBusy(new Set(inFlight.current));
        void client.invalidateQueries({ queryKey: exchangesKeys.all(storeId) });
      }
    },
    [client, storeId, toast],
  );

  return {
    isBusy: (id: string) => busy.has(id),
    accept: (exchange: Pick<Exchange, 'id' | 'number'>, customerName?: string) => run(exchange.id, () => exchangesApi.accept(storeId, exchange.id), `Troca ${exchange.number} aprovada.${customerName ? ` ${customerName} foi avisado.` : ''} A Webag cuida da coleta.`),
    refuse: (exchange: Pick<Exchange, 'id' | 'number'>, reason: string) => run(exchange.id, () => exchangesApi.refuse(storeId, exchange.id, reason), 'Troca recusada. O cliente pode contestar com o Webag.'),
    receive: (exchange: Pick<Exchange, 'id' | 'number'>, body: { ok: boolean; reason?: string; returnToStock?: boolean; code?: string }) =>
      run(exchange.id, () => exchangesApi.receive(storeId, exchange.id, body), body.ok ? 'Item conferido.' : 'Item reprovado. A Webag vai mediar.'),
  };
}

export function ExchangesPage() {
  const { store: query } = useMerchant();
  const store = query.data;
  if (query.isPending) return <SkeletonRows rows={3} height={160} label="Carregando as trocas" />;
  if (!store) return <LojistaNoAccess />;
  return (
    <div className={s.page}>
      <PageHeader title="Trocas" description="Responda em até 24 horas. A Webag busca e leva o item." />
      <Queue storeId={store.id} />
    </div>
  );
}

function Queue({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [scope, setScope] = useState<ExchangeScope>('pending');
  const online = useOnline();
  const now = useNow(60_000);
  const query = useInfiniteQuery({
    queryKey: exchangesKeys.list(storeId, scope),
    queryFn: ({ pageParam }) => exchangesApi.list(storeId, { scope, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: scope === 'pending' ? 30_000 : 60_000,
  });
  const actions = useExchangeActions(storeId);
  const rows = (query.data?.pages.flatMap((page) => page.data) ?? []).sort((a, b) => Date.parse(a.answerDeadlineAt) - Date.parse(b.answerDeadlineAt));

  let body;
  if (query.isPending) body = <SkeletonRows rows={3} height={168} label="Carregando as trocas" />;
  else if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 403) body = <LojistaNoAccess />;
    else body = <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />;
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={ArrowsClockwise}
        title={scope === 'pending' ? 'Nenhuma troca pendente' : 'Nenhuma troca aqui'}
        text="Quando um cliente pedir troca, avisamos com som e e-mail."
        actionLabel="Ver política de trocas"
        onAction={() => router.push(asRoute('/lojista/loja/trocas'))}
        testId={T('empty')}
      />
    );
  } else {
    body = (
      <>
        <ul className={s.list} aria-label="Trocas">
          {rows.map((exchange) => (
            <ExchangeCard key={exchange.id} exchange={exchange} now={now} online={online} actions={actions} />
          ))}
        </ul>
        {query.hasNextPage ? (
          <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…">
            Ver mais trocas
          </Button>
        ) : null}
      </>
    );
  }
  return (
    <>
      <Tabs label="Trocas por etapa" value={scope} onChange={setScope} tabs={SCOPES} />
      {body}
    </>
  );
}

function Deadline({ exchange, now }: { exchange: Exchange; now: number }) {
  const ms = answerRemainingMs(exchange, now);
  const tone = deadlineTone(ms);
  return (
    <span className={cx('wb-text-caption-strong', s.deadline, tone === 'warning' && s.deadlineWarning, tone === 'urgent' && s.deadlineUrgent, tone === 'late' && s.deadlineLate)} data-testid={T(`deadline-${exchange.id}`)}>
      {tone === 'warning' ? <Warning size={16} weight="fill" aria-hidden="true" /> : null}
      {tone === 'urgent' || tone === 'late' ? <WarningCircle size={16} weight="fill" aria-hidden="true" /> : null}
      {formatDeadline(ms)}
    </span>
  );
}

function ExchangeCard({ exchange, now, online, actions }: { exchange: Exchange; now: number; online: boolean; actions: ReturnType<typeof useExchangeActions> }) {
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = actions.isBusy(exchange.id);
  const pending = exchange.status === 'requested';
  const withdrawal = exchange.type === 'withdrawal';
  const item = exchange.item;
  const change = item && exchange.newVariant ? `${attributesText(item.attributes ?? {})} para ${attributesText(exchange.newVariant.attributes ?? {})}` : item ? attributesText(item.attributes ?? {}) : '';

  async function approve() {
    setError(null);
    setError(await actions.accept(exchange));
  }

  return (
    <li>
      <article className={s.card} aria-label={`Troca ${exchange.number}`} data-testid={T(`card-${exchange.id}`)}>
        <div className={s.head}>
          {pending ? <Deadline exchange={exchange} now={now} /> : <span className={cx('wb-text-caption-strong', s.deadline)}>{EXCHANGE_STATUS_LABEL[exchange.status]}</span>}
          <span className={cx('wb-text-caption-strong', s.deadline)}>{EXCHANGE_TYPE_LABEL[exchange.type]}</span>
        </div>
        <Link href={asRoute(`/lojista/trocas/${exchange.id}`)} style={{ color: 'inherit', textDecoration: 'none' }} className={s.itemRow}>
          <span className={s.thumb} aria-hidden="true">
            <SafeImage src={null} alt="" />
          </span>
          <span className={s.itemText}>
            <span className="wb-text-body-strong">{item?.name ?? 'Item do pedido'}{change ? ` · ${change}` : ''}</span>
            <span className="wb-text-caption">{exchange.number} · pedido {exchange.orderNumber}</span>
          </span>
        </Link>
        {withdrawal ? <p className={cx('wb-text-caption', s.ctx)}>Por lei, o cliente pode desistir em até 7 dias.</p> : null}
        {exchange.description ? <p className={cx('wb-text-body', s.ctx)}>{exchange.description}</p> : null}
        <p className={cx('wb-text-caption', s.ctx)}>{exchange.method === 'pickup_at_home' ? 'Webag busca em casa. Sem custo para você.' : 'Cliente leva à loja.'}</p>
        {exchange.autoApproved ? (
          <Banner tone="info" testId={T('auto-approved-badge')}>
            Aprovada automaticamente: o prazo de resposta terminou.
          </Banner>
        ) : null}
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {pending ? (
          <>
            <div className={s.actions}>
              <Button size="lg" onClick={() => void approve()} loading={busy} loadingLabel="Aprovando…" disabled={!online} aria-label={withdrawal ? `Aceitar desistência ${exchange.number}` : `Aprovar troca ${exchange.number}`} data-testid={T(withdrawal ? `accept-regret-${exchange.id}` : `approve-${exchange.id}`)}>
                {withdrawal ? 'Aceitar desistência' : 'Aprovar troca'}
              </Button>
              {withdrawal ? null : (
                <Button size="lg" variant="secondary" onClick={() => setRejecting(true)} disabled={busy || !online} aria-label={`${exchange.type === 'defect' ? 'Contestar defeito' : 'Recusar'} troca ${exchange.number}`} data-testid={T(exchange.type === 'defect' ? `contest-defect-${exchange.id}` : `reject-${exchange.id}`)}>
                  {exchange.type === 'defect' ? 'Contestar defeito' : 'Recusar'}
                </Button>
              )}
            </div>
            {online ? null : <p className={cx('wb-text-caption', s.ctx)}>Conecte-se para decidir. A troca continua esperando.</p>}
          </>
        ) : null}
      </article>
      {rejecting ? <RejectSheet exchange={exchange} actions={actions} onClose={() => setRejecting(false)} /> : null}
    </li>
  );
}

function RejectSheet({ exchange, actions, onClose }: { exchange: Exchange; actions: ReturnType<typeof useExchangeActions>; onClose: () => void }) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [other, setOther] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = actions.isBusy(exchange.id);
  const text = reason === 'other' ? (other.trim().length >= 10 ? other.trim() : null) : (REJECT_REASONS.find((r) => r.value === reason)?.label ?? null);
  const defect = exchange.type === 'defect';

  async function submit() {
    setTouched(true);
    setError(null);
    if (!text) return;
    const result = await actions.refuse(exchange, text);
    if (result) setError(result);
    else onClose();
  }

  return (
    <Dialog
      title={defect ? 'Contestar o defeito' : 'Por que recusar?'}
      onClose={onClose}
      locked={busy}
      testId={T('reject-sheet')}
      actions={
        <>
          <Button size="lg" variant="destructive" onClick={() => void submit()} loading={busy} loadingLabel="Enviando…" data-testid={T('reject-confirm')}>
            {defect ? 'Contestar defeito' : 'Recusar troca'}
          </Button>
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>
        {defect ? 'Contestar não é recusa final: a Webag analisa o caso.' : 'O cliente pode contestar com a Webag.'}
      </p>
      <div className={s.reasons}>
        <RadioCards legend="Motivo" name="exchange-reject" value={reason} onChange={setReason} options={REJECT_REASONS.map((r) => ({ value: r.value, label: r.label, testId: T(`reject-reason-${r.value}`) }))} />
        {reason === 'other' ? <TextArea label="Motivo (10 a 200 caracteres)" value={other} onChange={(event) => setOther(event.target.value.slice(0, 200))} counter={{ value: other.length, max: 200 }} rows={3} data-testid={T('reject-text')} error={touched && !text ? 'Escreva o motivo (mínimo 10 caracteres).' : undefined} /> : touched && !text ? <p className="wb-text-caption" role="alert" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>Escolha um motivo.</p> : null}
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
