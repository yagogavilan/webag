'use client';

import { Storefront } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { Badge, Banner, Button, ButtonLink, EmptyState, ErrorState, NoAccessState, SkeletonRows, TextField, cx, ui } from '@/components/ui';
import { adminStoresApi, storeKeys, type QueueRow } from '@/lib/api/admin-stores';
import type { StoreStatus } from '@/lib/api/lojista';
import { ApiError } from '@/lib/api/errors';
import { formatCents } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { STATUS_LABEL } from './catalog';

const T = (id: string) => tid('lojas', id);

export type SituationFilter = 'all' | 'approved' | 'in_review' | 'suspended';
export interface AllStoresFilters {
  q: string;
  situation: SituationFilter;
  noProduct: boolean;
  ownCommission: boolean;
}
export const NO_FILTERS: AllStoresFilters = { q: '', situation: 'all', noProduct: false, ownCommission: false };

const SITUATIONS: { id: SituationFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'approved', label: 'Ativa' },
  { id: 'in_review', label: 'Em análise' },
  { id: 'suspended', label: 'Suspensa' },
];
const TONE: Partial<Record<StoreStatus, 'success' | 'danger' | 'warning' | 'info' | 'neutral'>> = { approved: 'success', suspended: 'danger', rejected: 'danger', correction_requested: 'warning', in_review: 'info' };

/** Filtros na URL (`?aba=todas&q=&situacao=&semproduto=1&propria=1`): link compartilhável e o voltar funciona. */
export function filtersToQuery(filters: AllStoresFilters): string {
  const params = new URLSearchParams({ aba: 'todas' });
  if (filters.q) params.set('q', filters.q);
  if (filters.situation !== 'all') params.set('situacao', filters.situation);
  if (filters.noProduct) params.set('semproduto', '1');
  if (filters.ownCommission) params.set('propria', '1');
  return params.toString();
}

/** Lista completa (WB-350 C1, C3): busca por nome ou cidade, situação e os atalhos "Sem produto publicado" e "Comissão própria". */
export function AllStoresTab({ initial = NO_FILTERS }: { initial?: AllStoresFilters }) {
  const router = useRouter();
  const online = useOnline();
  const [filters, setFilters] = useState<AllStoresFilters>(initial);
  const q = useDeferredValue(filters.q.trim());
  const params = { status: filters.situation, q, noActiveProduct: filters.noProduct, ownCommission: filters.ownCommission };
  const query = useInfiniteQuery({
    queryKey: storeKeys.search(params),
    queryFn: ({ pageParam }) => adminStoresApi.search({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows: QueueRow[] = query.data?.pages.flatMap((page) => page.data) ?? [];
  const filtered = filters.situation !== 'all' || filters.noProduct || filters.ownCommission || q !== '';

  function change(next: AllStoresFilters) {
    setFilters(next);
    router.replace(asRoute(`/admin/lojas?${filtersToQuery(next)}`));
  }

  return (
    <div className={ui.stack} data-testid={T('all')}>
      <TextField label="Buscar por nome ou cidade" type="search" value={filters.q} onChange={(event) => change({ ...filters, q: event.target.value.slice(0, 80) })} autoComplete="off" data-testid={T('search')} />
      <div role="group" aria-label="Filtros das lojas" className={ui.row}>
        {SITUATIONS.map((item) => (
          <button key={item.id} type="button" className={ui.chip} aria-pressed={filters.situation === item.id} onClick={() => change({ ...filters, situation: item.id })} data-testid={T(`situation-${item.id}`)}>
            {item.label}
          </button>
        ))}
        <button type="button" className={ui.chip} aria-pressed={filters.noProduct} onClick={() => change({ ...filters, noProduct: !filters.noProduct })} data-testid={T('no-product')}>
          Sem produto publicado
        </button>
        <button type="button" className={ui.chip} aria-pressed={filters.ownCommission} onClick={() => change({ ...filters, ownCommission: !filters.ownCommission })} data-testid={T('own-commission')}>
          Comissão própria
        </button>
      </div>
      {!online ? <Banner tone="warning" offline>Sem conexão. Mostrando o que já carregou.</Banner> : null}
      {query.isPending ? (
        <SkeletonRows rows={6} height={56} label="Carregando as lojas" />
      ) : query.isError && rows.length === 0 ? (
        query.error instanceof ApiError && query.error.status === 403 ? (
          <NoAccessState />
        ) : (
          <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} text="Tente de novo em instantes." onRetry={() => void query.refetch()} />
        )
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState icon={Storefront} title="Nenhuma loja com esses filtros" text="Tire um filtro ou confira a escrita da busca." actionLabel="Limpar filtros" onAction={() => change(NO_FILTERS)} testId={T('empty-filter')} />
        ) : (
          <EmptyState icon={Storefront} title="Ainda não há lojas" text="As lojas aparecem aqui depois do cadastro." testId={T('empty')} />
        )
      ) : (
        <>
          <p className={cx('wb-text-caption', ui.muted)} aria-live="polite" data-testid={T('count')}>
            {rows.length}
            {query.hasNextPage ? '+' : ''} {rows.length === 1 && !query.hasNextPage ? 'loja' : 'lojas'}
          </p>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption>Todas as lojas</caption>
              <thead>
                <tr>
                  <th scope="col">Loja</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Produtos ativos</th>
                  <th scope="col">Vendas em 30 dias</th>
                  <th scope="col">Comissão</th>
                  <th scope="col">
                    <span className={ui.srOnly}>Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} data-testid={T(`row-${row.id}`)}>
                    <td data-primary>
                      <Link href={asRoute(`/admin/lojas/${row.id}`)} className="wb-text-body-strong">
                        {row.name ?? 'Loja sem nome'}
                      </Link>
                      <div className={cx('wb-text-caption', ui.muted)}>{row.city ?? ''}</div>
                    </td>
                    <td data-label="Situação">
                      <Badge tone={TONE[row.status] ?? 'neutral'}>{STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td data-label="Produtos ativos">{row.activeProducts === undefined ? '' : row.activeProducts === 0 ? <Badge tone="warning">Nenhum</Badge> : row.activeProducts}</td>
                    <td data-label="Vendas em 30 dias">{row.sales30dCents === undefined ? '' : row.orders30d ? formatCents(row.sales30dCents) : 'Sem pedidos'}</td>
                    <td data-label="Comissão">
                      {row.commissionPct === undefined ? '' : (
                        <span className={ui.row}>
                          {String(row.commissionPct).replace('.', ',')}%{row.commissionSource === 'store' ? <Badge tone="brand">Própria</Badge> : null}
                        </span>
                      )}
                    </td>
                    <td>
                      <ButtonLink href={asRoute(`/admin/lojas/${row.id}`)} variant="secondary" size="sm" aria-label={`Abrir ${row.name ?? 'loja'}`}>
                        Abrir
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.isError ? <Banner tone="danger">Não conseguimos carregar mais lojas.</Banner> : null}
          {query.hasNextPage ? (
            <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('load-more')}>
              Carregar mais
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
