'use client';

import { Gavel, Scales, Warning } from '@phosphor-icons/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, EmptyState, ErrorState, NoAccessState, RadioCards, SkeletonRows, TabPanel, Tabs, TextField, cx, useToast } from '@/components/ui';
import { ADMIN_STATUS_LABEL, ORIGIN_LABEL, TYPE_LABEL, adminExchangesApi, adminExchangesKeys, type Exchange, type MediationDecision, type MediationItem } from '@/lib/api/admin-exchanges';
import { ApiError } from '@/lib/api/errors';
import { formatCents, formatDay } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './disputes.module.css';

const T = (id: string) => tid('disputas', id);
type Tab = 'queue' | 'all';

/** WB-110, AT3: fila "Em mediação" (decidir a favor do cliente ou da loja) e lista de todas as trocas. Só operação e super admin. */
export function DisputesPage() {
  const { canView } = useSession();
  const [tab, setTab] = useState<Tab>('queue');
  if (!canView('disputas')) return <NoAccessState />;
  return (
    <div className={s.page}>
      <PageHeader title="Disputas de troca" description="Decida os casos em que a loja e o cliente não chegaram a um acordo." />
      <Tabs label="Trocas" value={tab} onChange={setTab} tabs={[{ id: 'queue', label: 'Em mediação', testId: T('tab-queue') }, { id: 'all', label: 'Todas as trocas', testId: T('tab-all') }]} />
      <TabPanel id={tab}>{tab === 'queue' ? <Queue /> : <AllExchanges />}</TabPanel>
    </div>
  );
}

const DECISION_LABEL: Record<MediationDecision, string> = { customer: 'A favor do cliente', store: 'A favor da loja' };

/** Texto do erro da decisão (409 já decidida, 403, rede). */
export function decideError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para decidir. Nada foi alterado.';
    if (caught.code === 'EXCHANGE_NOT_IN_MEDIATION') return 'Outra pessoa já decidiu este caso. Atualize a lista.';
    if (caught.status === 403) return 'Você não tem permissão para decidir mediações.';
  }
  return 'Não foi possível salvar. Nada foi alterado. Tente de novo.';
}

function Queue() {
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const [deciding, setDeciding] = useState<MediationItem | null>(null);
  const [decision, setDecision] = useState<MediationDecision | null>(null);
  const query = useInfiniteQuery({
    queryKey: adminExchangesKeys.mediations,
    queryFn: ({ pageParam }) => adminExchangesApi.mediations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  if (query.isPending) return <SkeletonRows rows={3} height={140} label="Carregando a fila de mediação" />;
  if (query.isError && !query.data) return <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} testId={T('error')} />;
  if (rows.length === 0) return <EmptyState icon={Scales} title="Nenhuma troca em mediação" text="Quando uma troca precisar da decisão da Webag, ela aparece aqui." testId={T('empty')} />;
  return (
    <>
      <ul className={s.list} aria-label="Trocas em mediação" data-testid={T('queue')}>
        {rows.map((item) => (
          <li key={item.id} className={s.card} data-testid={T(`case-${item.id}`)}>
            <div className={s.cardTop}>
              <span className="wb-text-body-strong">{item.number} · {TYPE_LABEL[item.type]}</span>
              {item.overdue ? <Badge tone="danger" icon={<Warning size={16} aria-hidden="true" />}>Prazo vencido em {formatDay(item.deadlineAt)}</Badge> : <Badge tone="info">Decidir até {formatDay(item.deadlineAt)}</Badge>}
            </div>
            <p className={cx('wb-text-caption', s.muted)}>{ORIGIN_LABEL[item.origin]} · {item.photoCount} {item.photoCount === 1 ? 'foto' : 'fotos'}</p>
            {item.storeReason ? <p className={cx('wb-text-body', s.quote)}><strong>Loja:</strong> {item.storeReason}</p> : null}
            {item.customerText ? <p className={cx('wb-text-body', s.quote)}><strong>Cliente:</strong> {item.customerText}</p> : null}
            {item.refusalNotAllowedByLaw ? (
              <Banner tone="warning" testId={T(`law-${item.id}`)}>
                A lei não permite a recusa da loja neste caso (arrependimento ou defeito dentro do prazo). Recomendamos decidir a favor do cliente.
              </Banner>
            ) : null}
            <div className={s.actions}>
              <Button variant="secondary" size="sm" icon={<Gavel size={20} aria-hidden="true" />} onClick={() => { setDecision(null); setDeciding(item); }} disabled={!online} data-testid={T(`decide-${item.id}`)}>Decidir</Button>
              <Link href={asRoute(`/admin/disputas/${item.id}`)} className="wb-text-body-strong" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }} data-testid={T(`open-${item.id}`)}>Ver a troca</Link>
            </div>
          </li>
        ))}
      </ul>
      {query.hasNextPage ? <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…">Ver mais</Button> : null}
      {deciding ? (
        <ReasonDialog
          title={`Decidir a troca ${deciding.number}`}
          description={`${TYPE_LABEL[deciding.type]}. A decisão é registrada no histórico da troca e as duas partes são avisadas.`}
          confirmLabel="Registrar decisão"
          testIds={{ dialog: T('decide-dialog'), reason: T('decide-reason'), confirm: T('decide-confirm') }}
          extra={
            <>
              <RadioCards legend="Decisão" name="mediation-decision" value={decision} onChange={setDecision} options={(['customer', 'store'] as const).map((d) => ({ value: d, label: DECISION_LABEL[d], description: d === 'customer' ? 'A troca segue o fluxo (reembolso ou peça nova).' : 'Recusa final: o cliente não pode contestar de novo.', testId: T(`decision-${d}`) }))} />
              {decision === 'store' && deciding.refusalNotAllowedByLaw ? <Banner tone="danger" testId={T('law-warning')}>Atenção: a recusa da loja não é permitida por lei neste caso.</Banner> : null}
            </>
          }
          precheck={() => (decision ? null : 'Escolha a decisão.')}
          onConfirm={async (reason) => {
            try {
              await adminExchangesApi.decide(deciding.id, { decision: decision!, reason });
            } catch (caught) {
              if (caught instanceof ApiError && caught.code === 'EXCHANGE_NOT_IN_MEDIATION') void client.invalidateQueries({ queryKey: adminExchangesKeys.all });
              throw new UserMessageError(decideError(caught));
            }
            await client.invalidateQueries({ queryKey: adminExchangesKeys.all });
            toast.show(`Troca ${deciding.number} decidida ${decision === 'customer' ? 'a favor do cliente' : 'a favor da loja'}.`);
          }}
          onClose={() => setDeciding(null)}
        />
      ) : null}
    </>
  );
}

const STATUS_FILTERS: { id: string; label: string; status?: Exchange['status'] }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'awaiting_fee', label: 'Aguardando a taxa', status: 'awaiting_fee' },
  { id: 'approved', label: 'Aprovadas', status: 'approved' },
  { id: 'completed', label: 'Concluídas', status: 'completed' },
  { id: 'rejected', label: 'Recusadas', status: 'rejected' },
];

function AllExchanges() {
  const online = useOnline();
  const [filterId, setFilterId] = useState('all');
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const status = STATUS_FILTERS.find((f) => f.id === filterId)?.status;
  const query = useInfiniteQuery({
    queryKey: adminExchangesKeys.list(filterId, q),
    queryFn: ({ pageParam }) => adminExchangesApi.list({ ...(status ? { status } : {}), ...(q ? { q } : {}), cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const searchError = term.trim() !== '' && term.trim().length < 3 ? 'Digite ao menos 3 caracteres do número (TR-...).' : undefined;
  return (
    <div className={s.page}>
      <form onSubmit={(event) => { event.preventDefault(); if (!searchError) setQ(term.trim()); }} role="search">
        <TextField label="Buscar pelo número da troca" value={term} onChange={(e) => { setTerm(e.target.value.slice(0, 12)); if (e.target.value.trim() === '') setQ(''); }} error={searchError} hint="Exemplo: TR-4K7P2. Pressione Enter." autoComplete="off" data-testid={T('search')} />
      </form>
      <div className={s.chips} role="group" aria-label="Filtrar por situação">
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} type="button" className={cx(s.chip, filterId === f.id && s.chipOn, 'wb-text-body-strong')} aria-pressed={filterId === f.id} onClick={() => setFilterId(f.id)} data-testid={T(`filter-${f.id}`)}>{f.label}</button>
        ))}
      </div>
      {query.isPending ? (
        <SkeletonRows rows={4} height={72} label="Carregando as trocas" />
      ) : query.isError && !query.data ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} testId={T('all-error')} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Scales} title="Nenhuma troca encontrada" text="Troque o filtro ou confira o número digitado." testId={T('all-empty')} />
      ) : (
        <>
          <ul className={s.list} aria-label="Trocas" data-testid={T('all-list')}>
            {rows.map((row) => (
              <li key={row.id} className={s.card}>
                <div className={s.cardTop}>
                  <Link href={asRoute(`/admin/disputas/${row.id}`)} className="wb-text-body-strong" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }} data-testid={T(`row-${row.id}`)}>{row.number} · pedido {row.orderNumber}</Link>
                  <Badge tone={row.status === 'in_mediation' ? 'warning' : 'neutral'}>{ADMIN_STATUS_LABEL[row.status]}</Badge>
                </div>
                <p className={cx('wb-text-caption', s.muted)}>{TYPE_LABEL[row.type]} · {formatDay(row.createdAt)} · taxa {formatCents(row.fee.amount)}</p>
              </li>
            ))}
          </ul>
          {query.hasNextPage ? <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…">Ver mais</Button> : null}
        </>
      )}
    </div>
  );
}
