'use client';

import { Receipt, X } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { OrderStatusBadge } from '@/features/orders/status-badge';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Button, EmptyState, ErrorState, NoAccessState, SelectField, SkeletonRows, TextField, cx } from '@/components/ui';
import { ADMIN_ORDER_STATUS_LABEL, MODE_LABEL, ORDER_STATUS_FILTERS, PAYMENT_LABEL, adminOpsApi, adminOpsKeys, type OrderFilters } from '@/lib/api/admin-ops';
import { formatCents, formatDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useIsOffline } from './common';
import s from './ops.module.css';

const T = (id: string) => tid('pedidos', id);

/** A busca da API é por número do pedido, e-mail EXATO do cliente ou ID (o nome do cliente sai mascarado e não é pesquisável). */
export function orderSearchError(term: string): string | undefined {
  const text = term.trim();
  return text !== '' && text.length < 2 ? 'Digite ao menos 2 caracteres.' : undefined;
}

/** `dateTo` antes de `dateFrom` não existe: mostramos o erro em vez de pedir à API uma lista vazia. */
export function periodError(from: string, to: string): string | undefined {
  return from && to && to < from ? 'A data final é anterior à inicial.' : undefined;
}

/** B5, WB-108 C1/C2: todos os pedidos, com filtros (período, cidade, loja, estado, tipo, pagamento) e busca por número, e-mail exato ou ID. Páginas de 50. */
export function AdminOrdersPage({ initialUserId, initialStoreId }: { initialUserId?: string | undefined; initialStoreId?: string | undefined }) {
  const { canView } = useSession();
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const [statusId, setStatusId] = useState('all');
  const [mode, setMode] = useState<'' | 'delivery' | 'pickup'>('');
  const [payment, setPayment] = useState<'' | 'pix' | 'card'>('');
  const [city, setCity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState(initialUserId ?? '');
  const [storeId, setStoreId] = useState(initialStoreId ?? '');
  const allowed = canView('pedidos');
  const period = periodError(from, to);
  const filters: OrderFilters = {
    q: q || undefined,
    status: ORDER_STATUS_FILTERS.find((f) => f.id === statusId)?.status,
    mode: mode || undefined,
    paymentMethod: payment || undefined,
    city: city.trim().length >= 2 ? city.trim() : undefined,
    userId: userId || undefined,
    storeId: storeId || undefined,
    from: period ? undefined : from || undefined,
    to: period ? undefined : to || undefined,
  };
  const list = useInfiniteQuery({
    queryKey: adminOpsKeys.orderList(filters),
    queryFn: ({ pageParam }) => adminOpsApi.orders(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: allowed,
  });
  const offline = useIsOffline(list.error);
  if (!allowed) return <NoAccessState />;

  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const searchError = orderSearchError(term);
  const filtered = Boolean(q || statusId !== 'all' || mode || payment || filters.city || userId || storeId || from || to);
  return (
    <div className={s.page}>
      <PageHeader title="Pedidos" description="Acompanhe e investigue qualquer pedido. O nome, o e-mail e o celular do cliente aparecem mascarados." />
      <form
        role="search"
        className={s.search}
        onSubmit={(event) => {
          event.preventDefault();
          if (!searchError) setQ(term.trim());
        }}
      >
        <TextField label="Buscar pedido" value={term} onChange={(e) => { setTerm(e.target.value.slice(0, 100)); if (e.target.value.trim() === '') setQ(''); }} error={searchError} hint="Número do pedido, e-mail exato do cliente ou ID. Pressione Enter." autoComplete="off" data-testid={T('search')} />
        <Button type="submit" variant="secondary" data-testid={T('search-submit')}>Buscar</Button>
      </form>
      <div className={s.chips} role="group" aria-label="Situação do pedido">
        {ORDER_STATUS_FILTERS.map((chip) => (
          <button key={chip.id} type="button" className={cx(s.chip, statusId === chip.id && s.chipOn, 'wb-text-body-strong')} aria-pressed={statusId === chip.id} onClick={() => setStatusId(chip.id)} data-testid={T(`filter-${chip.id}`)}>{chip.label}</button>
        ))}
      </div>
      <div className={s.filters}>
        <SelectField label="Tipo" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} data-testid={T('mode')}>
          <option value="">Entrega e retirada</option>
          <option value="delivery">Entrega</option>
          <option value="pickup">Retirada</option>
        </SelectField>
        <SelectField label="Pagamento" value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)} data-testid={T('payment')}>
          <option value="">PIX e cartão</option>
          <option value="pix">PIX</option>
          <option value="card">Cartão</option>
        </SelectField>
        <TextField label="Cidade da loja" value={city} onChange={(e) => setCity(e.target.value.slice(0, 80))} autoComplete="off" data-testid={T('city')} />
        <TextField label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid={T('from')} />
        <TextField label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={period} data-testid={T('to')} />
      </div>
      {userId || storeId ? (
        <div className={s.actions} data-testid={T('scope')}>
          {userId ? <Button variant="secondary" icon={<X size={16} aria-hidden="true" />} onClick={() => setUserId('')} data-testid={T('clear-user')}>Só os pedidos de uma conta. Tirar filtro</Button> : null}
          {storeId ? <Button variant="secondary" icon={<X size={16} aria-hidden="true" />} onClick={() => setStoreId('')} data-testid={T('clear-store')}>Só os pedidos de uma loja. Tirar filtro</Button> : null}
        </div>
      ) : null}

      {list.isPending ? (
        <SkeletonRows rows={5} height={56} label="Carregando os pedidos" />
      ) : list.isError && !list.data ? (
        <ErrorState offline={offline} onRetry={() => void list.refetch()} testId={T('error')} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Receipt} title={filtered ? 'Nenhum pedido encontrado' : 'Nenhum pedido ainda'} text={filtered ? 'Confira o que foi digitado ou tire alguns filtros.' : 'Os pedidos feitos no app aparecem aqui.'} testId={T('empty')} />
      ) : (
        <>
          <div className={s.tableWrap}>
            <table className={s.table} data-testid={T('table')}>
              <caption className={s.srOnly}>Pedidos</caption>
              <thead>
                <tr className="wb-text-caption-strong">
                  <th scope="col">Pedido</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Loja</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Tipo e pagamento</th>
                  <th scope="col" className={s.num}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr key={order.id} data-testid={T(`row-${order.id}`)}>
                    <td data-label="Pedido">
                      <Link href={asRoute(`/admin/pedidos/${order.id}`)} className={cx('wb-text-body-strong', s.titleLink)} data-testid={T(`open-${order.id}`)}>#{order.number}</Link>
                      <span className={cx('wb-text-caption', s.muted)} style={{ display: 'block' }}>{formatDateTime(order.createdAt)}</span>
                    </td>
                    <td data-label="Situação"><OrderStatusBadge status={order.status} label={ADMIN_ORDER_STATUS_LABEL[order.status]} /></td>
                    <td data-label="Loja" className="wb-text-body">{order.store.name}{order.store.city ? ` · ${order.store.city}` : ''}</td>
                    <td data-label="Cliente" className="wb-text-body">{order.customer.name}</td>
                    <td data-label="Tipo e pagamento" className="wb-text-body">{MODE_LABEL[order.mode]} · {PAYMENT_LABEL[order.paymentMethod]}</td>
                    <td data-label="Total" className={cx('wb-text-body-strong', s.num)}>{formatCents(order.total.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.hasNextPage ? <Button variant="secondary" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('more')}>Ver mais 50</Button> : null}
        </>
      )}
    </div>
  );
}
