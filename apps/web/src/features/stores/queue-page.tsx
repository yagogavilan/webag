'use client';

import { CheckCircle, Hourglass, Warning } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, ButtonLink, EmptyState, ErrorState, NoAccessState, SkeletonRows, Tabs, TextField, cx, ui } from '@/components/ui';
import { adminStoresApi, storeKeys, type QueueRow } from '@/lib/api/admin-stores';
import { ApiError } from '@/lib/api/errors';
import { formatClock } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { AllStoresTab, NO_FILTERS, type AllStoresFilters } from './all-stores';
import { sinceLabel } from './catalog';

const T = (id: string) => tid('fila', id);

type TabId = 'pending' | 'waiting' | 'all';
type FilterId = 'all' | 'overdue';
const TAB_STATUS = { pending: 'in_review', waiting: 'correction_requested' } as const;

function useQueue(tab: 'pending' | 'waiting', enabled: boolean) {
  return useInfiniteQuery({
    queryKey: storeKeys.queue(TAB_STATUS[tab]),
    queryFn: ({ pageParam }) => adminStoresApi.queue(TAB_STATUS[tab], pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/** Selo de prazo (ícone + texto): o prazo para de contar enquanto a loja espera o lojista (SLA pausado). */
export function DeadlineBadge({ row }: { row: QueueRow }) {
  if (row.status === 'correction_requested') return <Badge tone="neutral" icon={<Hourglass size={16} aria-hidden="true" />}>Prazo pausado</Badge>;
  if (row.overdue) return <Badge tone="danger" icon={<Warning size={16} weight="fill" aria-hidden="true" />}>Atrasada</Badge>;
  return <Badge tone="neutral" icon={<CheckCircle size={16} aria-hidden="true" />}>No prazo</Badge>;
}

const normalize = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A1: fila de aprovação. A API devolve as mais antigas primeiro; a busca e o filtro "Atrasadas" são locais. */
export function QueuePage({ initialTab = 'pending', initialFilters = NO_FILTERS }: { initialTab?: TabId; initialFilters?: AllStoresFilters }) {
  const { canView, canEdit } = useSession();
  const online = useOnline();
  const allowed = canView('lojas');
  const [tab, setTab] = useState<TabId>(initialTab);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const pending = useQueue('pending', allowed && tab !== 'all');
  const waiting = useQueue('waiting', allowed && tab !== 'all');
  const active = tab === 'waiting' ? waiting : pending;
  const decide = canEdit('lojas');

  const rowsOf = (query: typeof pending): QueueRow[] => query.data?.pages.flatMap((page) => page.data) ?? [];
  const rows = rowsOf(active);
  const visible = useMemo(() => {
    const term = normalize(search.trim());
    return rows.filter((row) => (filter === 'overdue' ? row.overdue : true) && (!term || normalize(`${row.name ?? ''} ${row.city ?? ''} ${row.documentMasked}`).includes(term)));
  }, [rows, filter, search]);
  const count = (query: typeof pending): string => (query.data ? `${rowsOf(query).length}${query.hasNextPage ? '+' : ''}` : '…');
  const oldest = visible[0];

  if (!allowed) return <NoAccessState />;

  const list = (
    <>
      <div className={ui.row} style={{ justifyContent: 'space-between' }}>
        <div role="group" aria-label="Filtros da fila" className={ui.row}>
          {(
            [
              ['all', 'Todas'],
              ['overdue', 'Atrasadas'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={ui.chip} aria-pressed={filter === id} onClick={() => setFilter(id)} data-testid={T(`filter-${id}`)}>
              {label}
            </button>
          ))}
        </div>
        <div className={ui.row}>
          <span className={cx('wb-text-caption', ui.muted)} aria-live="polite">
            {active.dataUpdatedAt ? `Atualizada às ${formatClock(new Date(active.dataUpdatedAt))}` : ''}
          </span>
          <Button variant="secondary" size="sm" onClick={() => void active.refetch()} loading={active.isRefetching && !active.isFetchingNextPage} loadingLabel="Atualizando…" data-testid={T('refresh')}>
            Atualizar
          </Button>
        </div>
      </div>
      {!online ? (
        <Banner tone="warning" offline>
          Sem conexão. Mostrando o que já carregou.
        </Banner>
      ) : null}
      {active.isPending ? (
        <SkeletonRows rows={6} height={56} label="Carregando a fila" />
      ) : active.isError && rows.length === 0 ? (
        active.error instanceof ApiError && active.error.status === 403 ? (
          <NoAccessState />
        ) : (
          <ErrorState offline={!online || (active.error instanceof ApiError && active.error.isNetwork)} onRetry={() => void active.refetch()} />
        )
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title={tab === 'pending' ? 'Fila em dia' : 'Nenhuma loja aguardando o lojista'}
          text={tab === 'pending' ? 'Nenhuma loja esperando análise.' : 'As lojas com correção pedida aparecem aqui.'}
          testId={T('empty')}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="Nenhuma loja neste filtro."
          text="Tire o filtro ou mude a busca."
          actionLabel="Limpar filtros"
          onAction={() => {
            setFilter('all');
            setSearch('');
          }}
          testId={T('empty-filter')}
        />
      ) : (
        <>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption>Lojas {tab === 'pending' ? 'para analisar' : 'aguardando o lojista'}, ordenadas da mais antiga para a mais nova</caption>
              <thead>
                <tr>
                  <th scope="col">Loja</th>
                  <th scope="col">Cidade</th>
                  <th scope="col" aria-sort="ascending">
                    Enviada
                  </th>
                  <th scope="col">Prazo</th>
                  <th scope="col">
                    <span className={ui.srOnly}>Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} data-testid={T(`row-${row.id}`)}>
                    <td data-primary>
                      <Link href={asRoute(`/admin/lojas/${row.id}`)} className="wb-text-body-strong">
                        {row.name ?? 'Loja sem nome'}
                      </Link>
                      <div className={cx('wb-text-caption', ui.muted)}>{row.documentMasked}</div>
                    </td>
                    <td data-label="Cidade">{row.city ?? ''}</td>
                    <td data-label="Enviada">{sinceLabel(row.submittedAt)}</td>
                    <td data-label="Prazo">
                      <span className={ui.row}>
                        <DeadlineBadge row={row} />
                        {row.holderMismatch ? <Badge tone="warning">Titular da conta diferente</Badge> : null}
                      </span>
                    </td>
                    <td>
                      <ButtonLink href={asRoute(`/admin/lojas/${row.id}`)} variant="secondary" size="sm" aria-label={`${decide ? 'Abrir' : 'Ver'} ${row.name ?? 'loja'}`} data-testid={T(`row-${row.id}-open`)}>
                        {decide ? 'Abrir' : 'Ver'}
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {active.isError ? <Banner tone="danger">Não conseguimos carregar mais lojas.</Banner> : null}
          {active.hasNextPage ? (
            <Button variant="secondary" onClick={() => void active.fetchNextPage()} loading={active.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('load-more')}>
              Carregar mais
            </Button>
          ) : null}
        </>
      )}
    </>
  );

  return (
    <div className={ui.stack}>
      <PageHeader
        title="Lojas"
        description="Fila de aprovação (as mais antigas primeiro) e todas as lojas."
        action={
          decide && tab === 'pending' && oldest ? (
            <ButtonLink href={asRoute(`/admin/lojas/${oldest.id}`)} size="lg" data-testid={T('analyze-oldest')}>
              Analisar a mais antiga
            </ButtonLink>
          ) : null
        }
      />
      <Tabs
        label="Filas"
        value={tab}
        onChange={(next) => setTab(next)}
        tabs={[
          { id: 'pending', label: `Para analisar (${count(pending)})`, testId: T('tab-pending') },
          { id: 'waiting', label: `Aguardando lojista (${count(waiting)})`, testId: T('tab-waiting') },
          { id: 'all', label: 'Todas as lojas', testId: T('tab-all') },
        ]}
      />
      {tab === 'all' ? null : <TextField label="Buscar por nome, cidade ou final do CPF/CNPJ" type="search" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" data-testid={T('search-input')} />}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={ui.stack}>
        {tab === 'all' ? <AllStoresTab initial={initialFilters} /> : list}
      </div>
    </div>
  );
}
