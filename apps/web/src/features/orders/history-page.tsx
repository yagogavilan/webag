'use client';

import { Receipt } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Button, EmptyState, ErrorState, SkeletonRows, TextField, cx } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import { ApiError } from '@/lib/api/errors';
import { ordersApi, ordersKeys, type OrderStatus, type StoreOrderSummary } from '@/lib/api/orders';
import { formatCents, formatDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { OrdersSubnav } from './orders-chrome';
import { OrdersGate } from './orders-gate';
import { OrderStatusBadge } from './status-badge';
import s from './orders.module.css';

const T = (id: string) => ltid('history', id);
const NUMBER = /^WB-[A-Za-z0-9]{5}$/;

type StatusFilter = 'all' | Extract<OrderStatus, 'delivered' | 'cancelled' | 'refused'>;
type ModeFilter = 'all' | 'delivery' | 'pickup';
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'delivered', label: 'Entregue' },
  { id: 'cancelled', label: 'Cancelado' },
  { id: 'refused', label: 'Recusado' },
];
const MODE_FILTERS: { id: ModeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'delivery', label: 'Entrega' },
  { id: 'pickup', label: 'Retirada' },
];

export function HistoryPage() {
  return (
    <OrdersGate>
      {() => (
        <div className={s.page}>
          <PageHeader title="Pedidos" />
          <OrdersSubnav current="history" />
          <History />
        </div>
      )}
    </OrdersGate>
  );
}

function History() {
  const { store } = useMerchant();
  const storeId = store.data?.id ?? '';
  const router = useRouter();
  const online = useOnline();
  const [search, setSearch] = useState('');
  const [searchError, setSearchError] = useState<string | undefined>();
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [mode, setMode] = useState<ModeFilter>('all');

  const query = useInfiniteQuery({
    queryKey: ordersKeys.history(storeId, number),
    queryFn: ({ pageParam }) => ordersApi.list(storeId, { scope: 'history', number: number || undefined, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(storeId),
  });

  const rows = useMemo(() => {
    const all = query.data?.pages.flatMap((page) => page.data) ?? [];
    return all.filter((order) => (status === 'all' || order.status === status) && (mode === 'all' || order.mode === mode));
  }, [query.data, status, mode]);

  function submitSearch() {
    const value = search.trim().toUpperCase();
    if (value && !NUMBER.test(value)) {
      setSearchError('Digite o código do pedido, como WB-4K7P2.');
      return;
    }
    setSearchError(undefined);
    setNumber(value);
  }

  const filtered = status !== 'all' || mode !== 'all' || number !== '';

  return (
    <>
      <form
        className={s.filters}
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch();
        }}
        role="search"
      >
        <div className={s.ticketTools}>
          <TextField label="Código do pedido" placeholder="WB-4K7P2" value={search} onChange={(event) => setSearch(event.target.value)} error={searchError} data-testid={T('search')} />
          <Button type="submit" variant="secondary" data-testid={T('search-submit')}>
            Buscar
          </Button>
        </div>
        <div className={s.chipRow} role="group" aria-label="Filtrar por estado">
          <span className={cx('wb-text-caption-strong', s.chipLabel)}>Estado</span>
          {STATUS_FILTERS.map((filter) => (
            <button key={filter.id} type="button" className={cx(s.paperChoice, status === filter.id && s.paperChoiceOn, 'wb-text-body-strong')} aria-pressed={status === filter.id} onClick={() => setStatus(filter.id)} data-testid={T(`filter-${filter.id}`)}>
              {filter.label}
            </button>
          ))}
        </div>
        <div className={s.chipRow} role="group" aria-label="Filtrar por tipo">
          <span className={cx('wb-text-caption-strong', s.chipLabel)}>Tipo</span>
          {MODE_FILTERS.map((filter) => (
            <button key={filter.id} type="button" className={cx(s.paperChoice, mode === filter.id && s.paperChoiceOn, 'wb-text-body-strong')} aria-pressed={mode === filter.id} onClick={() => setMode(filter.id)} data-testid={T(`filter-mode-${filter.id}`)}>
              {filter.label}
            </button>
          ))}
        </div>
      </form>

      {query.isPending ? (
        <SkeletonRows rows={8} height={64} label="Carregando o histórico" />
      ) : query.isError && !query.data ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState icon={Receipt} title="Nenhum pedido neste filtro" text="Tente outro estado, outro tipo ou outro código." actionLabel="Limpar filtros" onAction={() => { setStatus('all'); setMode('all'); setSearch(''); setNumber(''); setSearchError(undefined); }} testId={T('empty-filter')} />
        ) : (
          <EmptyState icon={Receipt} title="Nenhum pedido ainda" text="Os pedidos da sua loja aparecem aqui." actionLabel="Ir para o painel de pedidos" onAction={() => router.push(asRoute('/lojista/pedidos'))} testId={T('empty')} />
        )
      ) : (
        <>
          <ul className={s.cards} aria-label="Pedidos anteriores">
            {rows.map((order) => (
              <Row key={order.id} order={order} />
            ))}
          </ul>
          {query.hasNextPage ? (
            <div className={s.pager}>
              <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('page-next')}>
                Ver mais pedidos
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function Row({ order }: { order: StoreOrderSummary }) {
  return (
    <li>
      <Link href={asRoute(`/lojista/pedidos/${order.id}`)} className={s.card} style={{ textDecoration: 'none', color: 'inherit' }} data-testid={T(`row-${order.id}`)} aria-label={`Pedido ${order.number}, ${order.customerFirstName}`}>
        <span className={s.cardHead}>
          <span className={cx('wb-text-title2', s.rowLink)}>{order.number}</span>
          <span className="wb-text-caption">{formatDateTime(order.paidAt ?? order.createdAt)}</span>
        </span>
        <span className={s.meta}>
          <OrderStatusBadge status={order.status} />
          <span className="wb-text-body">{order.customerFirstName}</span>
        </span>
        <span className="wb-text-body">
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'} · {order.firstItemName}
        </span>
        {order.total ? <span className="wb-text-title2">{formatCents(order.total.amount)}</span> : null}
      </Link>
    </li>
  );
}
