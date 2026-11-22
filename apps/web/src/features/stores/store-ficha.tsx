'use client';

import { ClockCountdown, ShoppingBag } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { DiffView, diffRows } from '@/components/panel/diff-view';
import { REASON_LABEL } from '@/components/panel/admin-reason';
import { Badge, Banner, Button, EmptyState, ErrorState, SkeletonRows, cx, ui } from '@/components/ui';
import { adminStoresApi, storeKeys, type AdminStoreOverview, type StoreHistoryType } from '@/lib/api/admin-stores';
import { ADMIN_ORDER_STATUS_LABEL } from '@/lib/api/admin-ops';
import { ApiError } from '@/lib/api/errors';
import { formatCents, formatClock, formatDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './stores.module.css';

const T = (id: string) => tid('loja', id);

/** Resumo (WB-350 C1, C3): 5 números de 30 dias, dados editáveis e a caixa que explica o que só o lojista altera (C4: não existe campo fiscal). */
export function OverviewTab({ overview, canEdit, onEdit }: { overview: AdminStoreOverview; canEdit: boolean; onEdit: () => void }) {
  const { store, indicators, commission, recentOrders } = overview;
  return (
    <div className={ui.stack} data-testid={T('overview')}>
      <dl className={s.numbers}>
        <div className={s.number}>
          <dt className="wb-text-caption-strong">Vendas em 30 dias</dt>
          <dd className="wb-text-title2">{formatCents(indicators.gmv.amount)}</dd>
        </div>
        <div className={s.number}>
          <dt className="wb-text-caption-strong">Pedidos</dt>
          <dd className="wb-text-title2">{indicators.orders}</dd>
        </div>
        <div className={s.number}>
          <dt className="wb-text-caption-strong">Cancelamentos</dt>
          <dd className="wb-text-title2">
            {indicators.cancellations.count}
            {indicators.cancellations.pct !== null ? ` (${String(indicators.cancellations.pct).replace('.', ',')}%)` : ''}
          </dd>
          {indicators.cancellations.pct === null && indicators.orders > 0 ? <dd className={cx('wb-text-caption', ui.muted)}>Poucos pedidos para calcular o percentual.</dd> : null}
        </div>
        <div className={s.number}>
          <dt className="wb-text-caption-strong">Produtos ativos</dt>
          <dd className="wb-text-title2">{indicators.activeProducts}</dd>
        </div>
        <div className={s.number}>
          <dt className="wb-text-caption-strong">Comissão em vigor</dt>
          <dd className="wb-text-title2">{String(commission.pct).replace('.', ',')}%</dd>
          <dd className={cx('wb-text-caption', ui.muted)}>{commission.sourceLabel}</dd>
        </div>
      </dl>
      {indicators.empty ? (
        <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('overview-empty')}>
          Sem pedidos nos últimos 30 dias.{indicators.activeProducts === 0 ? ' A loja ainda não tem produto à venda: sem produto não há pedido.' : ''}
        </p>
      ) : null}

      <section aria-labelledby="ficha-dados" className={ui.stack}>
        <div className={ui.row} style={{ justifyContent: 'space-between' }}>
          <h2 id="ficha-dados" className="wb-text-title2">Dados da loja</h2>
          {canEdit ? <Button variant="secondary" size="sm" onClick={onEdit} data-testid={T('edit-profile')}>Editar dados</Button> : null}
        </div>
        <dl className={s.dataList} data-testid={T('profile')}>
          <dt className={cx('wb-text-caption-strong', ui.muted)}>Nome de exibição</dt>
          <dd>{store.name ?? 'Sem nome'}</dd>
          <dt className={cx('wb-text-caption-strong', ui.muted)}>WhatsApp</dt>
          <dd>{store.whatsapp ?? 'Não informado'}</dd>
          <dt className={cx('wb-text-caption-strong', ui.muted)}>Telefone</dt>
          <dd>{store.phone ?? 'Não informado'}</dd>
          <dt className={cx('wb-text-caption-strong', ui.muted)}>Descrição</dt>
          <dd>{store.description ?? 'Sem descrição'}</dd>
        </dl>
        <p className={cx('wb-text-body', s.fixedNote)} data-testid={T('fixed-note')}>CNPJ, razão social, documentos e conta de recebimento só o lojista altera, pelo fluxo de análise.</p>
      </section>

      {recentOrders.length > 0 ? (
        <section aria-labelledby="ficha-pedidos" className={ui.stack}>
          <h2 id="ficha-pedidos" className="wb-text-title2">Últimos pedidos</h2>
          <ul className={s.history} data-testid={T('recent-orders')}>
            {recentOrders.map((order) => (
              <li key={order.id} className="wb-text-body">
                <Link href={asRoute(`/admin/pedidos/${order.id}`)} className="wb-text-body-strong">
                  Pedido de {formatDateTime(order.createdAt)}
                </Link>{' '}
                · {formatCents(order.total.amount)} · {ADMIN_ORDER_STATUS_LABEL[order.status as keyof typeof ADMIN_ORDER_STATUS_LABEL] ?? order.status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const WHO: Record<'merchant' | 'admin', string> = { merchant: 'pelo lojista', admin: 'pela Webag' };

/** Horário e pausa (WB-351 C1): estado de agora e as duas ações que o perfil pode fazer. */
export function HoursPauseTab({ overview, canEdit, onPause, onResume }: { overview: AdminStoreOverview; canEdit: boolean; onPause: () => void; onResume: () => void }) {
  const { operation, store } = overview;
  const approved = store.status === 'approved';
  return (
    <div className={ui.stack} data-testid={T('hours-pause')}>
      {operation.pause ? (
        <Banner tone="warning" testId={T('paused')}>
          Loja pausada {operation.pause.until ? `até ${formatClock(operation.pause.until)}` : 'até reabrir'} {WHO[operation.pause.by]}.{operation.pause.reasonLabel ? ` Motivo: ${operation.pause.reasonLabel}.` : ''}
        </Banner>
      ) : (
        <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('open-state')}>
          {approved ? (operation.openNow ? `Loja aberta agora.${operation.closesAt ? ` Fecha às ${formatClock(operation.closesAt)}.` : ''}` : 'Loja fechada agora, fora do horário.') : 'A loja ainda não está recebendo pedidos.'}
        </p>
      )}
      {canEdit && operation.pause ? (
        <div>
          <Button onClick={onResume} data-testid={T('resume')}>Reabrir agora</Button>
        </div>
      ) : null}
      {canEdit && approved && !operation.pause ? (
        <div>
          <Button variant="secondary" icon={<ClockCountdown size={20} aria-hidden="true" />} onClick={onPause} data-testid={T('pause')}>Pausar loja</Button>
        </div>
      ) : null}
    </div>
  );
}

const FILTERS: { id: 'all' | StoreHistoryType; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'price', label: 'Preço' },
  { id: 'stock', label: 'Estoque' },
  { id: 'hours', label: 'Horário' },
  { id: 'access', label: 'Acesso' },
];

const ACTOR_NAME = { admin: (name: string | null) => name ?? 'Admin', merchant: (name: string | null) => name ?? 'Lojista', system: () => 'Sistema' } as const;

/** Histórico por loja (WB-350 C4): quem, quando, antes e depois, motivo. "Restaurar" e CSV são da WB-354 (R1.3). */
export function HistoryTab({ storeId }: { storeId: string }) {
  const online = useOnline();
  const [filter, setFilter] = useState<'all' | StoreHistoryType>('all');
  const type = filter === 'all' ? undefined : filter;
  const query = useInfiniteQuery({
    queryKey: storeKeys.history(storeId, filter),
    queryFn: ({ pageParam }) => adminStoresApi.history(storeId, type, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className={ui.stack} data-testid={T('audit')}>
      <div role="group" aria-label="Filtrar o histórico" className={s.listChips}>
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={ui.chip} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} data-testid={T(`audit-filter-${item.id}`)}>
            {item.label}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <SkeletonRows rows={4} height={96} label="Carregando o histórico" />
      ) : query.isError && rows.length === 0 ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Nenhuma alteração registrada" text="As alterações de preço, estoque, horário, pausa e as visitas de “Ver como” aparecem aqui." testId={T('audit-empty')} />
      ) : (
        <>
          <ol className={s.history} aria-label="Alterações da loja">
            {rows.map((entry) => {
              const diff = entry.type === 'access' ? [] : diffRows(entry.before, entry.after);
              return (
                <li key={entry.id} className={s.auditEntry} data-testid={T(`audit-${entry.id}`)}>
                  <div className={s.auditHead}>
                    <span className="wb-text-body-strong">{entry.summary}</span>
                    <span className={cx('wb-text-caption', ui.muted)}>
                      {formatDateTime(entry.at)} · {ACTOR_NAME[entry.actor.kind](entry.actor.name)}
                    </span>
                  </div>
                  {entry.target.label ? <span className={cx('wb-text-caption', ui.muted)}>{entry.target.label}</span> : null}
                  {diff.length > 0 ? <DiffView rows={diff} /> : null}
                  {entry.reason ? (
                    <p className="wb-text-caption" style={{ margin: 0 }}>
                      <Badge tone="neutral">Motivo</Badge> {REASON_LABEL[entry.reason.code]}
                      {entry.reason.note ? ` (${entry.reason.note})` : ''}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {query.isError ? <Banner tone="danger">Não conseguimos carregar mais alterações.</Banner> : null}
          {query.hasNextPage ? (
            <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('audit-more')}>
              Carregar mais
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
