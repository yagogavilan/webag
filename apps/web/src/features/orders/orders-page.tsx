'use client';

import { Receipt } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Banner, EmptyState, ErrorState, Skeleton, Tabs, cx } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import type { StoreOrderSummary } from '@/lib/api/orders';
import { ORDER_GROUPS, ORDER_GROUP_LABEL, groupOf, type OrderGroup } from '@/lib/orders/status';
import { ltid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { useOnline } from '@/lib/use-online';
import { NoAccessState } from '@/components/ui';
import { OrderCard } from './order-card';
import { OrdersGate } from './orders-gate';
import { OrdersSubnav, StatusBar } from './orders-chrome';
import { useOrdersRuntime } from './orders-runtime';
import s from './orders.module.css';

const T = (id: string) => ltid('orders', id);

const TAB_TEST_ID: Record<OrderGroup, string> = { new: T('tab-new'), preparing: T('tab-preparing'), ready: T('tab-ready') };

export function OrdersPage() {
  return (
    <OrdersGate>
      {() => (
        <div className={s.page}>
          <PageHeader title="Pedidos" />
          <OrdersSubnav current="live" />
          <Board />
        </div>
      )}
    </OrdersGate>
  );
}

function Board() {
  const rt = useOrdersRuntime();
  const online = useOnline();
  const now = useNow(30_000);
  const [tab, setTab] = useState<OrderGroup>('new');

  const groups = useMemo(() => {
    const result: Record<OrderGroup, StoreOrderSummary[]> = { new: rt.pending, preparing: [], ready: [] };
    for (const order of rt.inProgress) {
      const group = groupOf(order.status);
      if (group && group !== 'new') result[group].push(order);
    }
    return result;
  }, [rt.pending, rt.inProgress]);

  const failure = rt.newQuery.data === undefined ? rt.newQuery : rt.progressQuery.data === undefined ? rt.progressQuery : null;
  if (failure?.isError) {
    if (failure.error instanceof ApiError && failure.error.status === 403) return <NoAccessState onBack={() => window.location.assign('/lojista')} />;
    return <ErrorState offline={!online || (failure.error instanceof ApiError && failure.error.isNetwork)} onRetry={() => void rt.refresh()} />;
  }

  const loaded = rt.newQuery.data !== undefined && rt.progressQuery.data !== undefined;
  const total = ORDER_GROUPS.reduce((sum, group) => sum + groups[group].length, 0);

  return (
    <>
      <StatusBar />
      {rt.connectionLost && online ? (
        <Banner tone="danger" offline testId={T('connection-banner')}>
          Sem conexão com o Webag. Você pode não ver pedidos novos. Reconectando…
        </Banner>
      ) : null}
      {rt.wakeLock === 'unsupported' ? (
        <p className={cx('wb-text-caption', s.hint)} data-testid={T('wake-hint')}>
          Deixe a tela ligada para não perder pedidos.
        </p>
      ) : null}
      {!loaded ? (
        <div className={s.board} data-testid="skeleton" role="status" aria-label="Carregando os pedidos">
          {ORDER_GROUPS.map((group) => (
            <div key={group} className={s.column} data-active={tab === group} style={{ display: undefined }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={168} />
              ))}
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyStateSound />
      ) : (
        <>
          <div className={s.tabsOnly}>
            <Tabs
              label="Pedidos por etapa"
              value={tab}
              onChange={setTab}
              tabs={ORDER_GROUPS.map((group) => ({ id: group, label: `${ORDER_GROUP_LABEL[group]} (${groups[group].length})`, testId: TAB_TEST_ID[group] }))}
            />
          </div>
          <div className={s.board}>
            {ORDER_GROUPS.map((group) => (
              <section key={group} id={`panel-${group}`} role="tabpanel" aria-labelledby={`tab-${group}`} className={s.column} data-active={tab === group}>
                <h2 className={cx('wb-text-title2', s.columnHead)}>
                  {ORDER_GROUP_LABEL[group]} <span className={cx('wb-text-body', s.columnCount)}>({groups[group].length})</span>
                </h2>
                {groups[group].length === 0 ? (
                  <p className={cx('wb-text-body', s.columnEmpty)}>Nenhum pedido aqui agora.</p>
                ) : (
                  <ul className={s.cards}>
                    {groups[group].map((order) => (
                      <OrderCard key={order.id} order={order} now={now} online={online} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function EmptyStateSound() {
  const { sound } = useOrdersRuntime();
  return (
    <EmptyState
      icon={Receipt}
      title="Nenhum pedido agora"
      text="Mantenha esta tela aberta. Avisamos com som quando chegar."
      actionLabel="Tocar som de teste"
      onAction={() => {
        void (async () => {
          if (!sound.enabled) await sound.enable();
          sound.test();
        })();
      }}
      testId={T('empty')}
    />
  );
}
