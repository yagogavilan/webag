'use client';

import { ArrowLeft, Bag, ChatCircleText, Printer, Truck } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog, UserMessageError } from '@/components/panel/reason-dialog';
import { ActionMenu, Banner, Button, ErrorState, Skeleton, cx, type MenuAction } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import { ApiError } from '@/lib/api/errors';
import { ordersApi, ordersKeys, type StoreOrder } from '@/lib/api/orders';
import { formatCents, formatClock, formatFullDateTime } from '@/lib/format';
import { ACTOR_LABEL, ORDER_STATUS_LABEL, addressLines, arrivedAt, attributesText, formatElapsed, formatPhone, nextStep, skipStep, whatsappHref } from '@/lib/orders/status';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { ReadyBy } from './ready-by';
import { useOnline } from '@/lib/use-online';
import { CompleteDialog } from './complete-dialog';
import { OrdersGate } from './orders-gate';
import { ReadyDialog } from './ready-dialog';
import { RejectDialog } from './reject-form';
import { ModeBadge, OrderStatusBadge } from './status-badge';
import s from './orders.module.css';
import { useOrderActions } from './use-order-actions';

const T = (id: string) => ltid('order', id);

/** Estado da corrida do ponto de vista da loja: só o que a loja precisa saber (sem custo, sem telefone do motoboy). */
const LOGISTICS_LABEL: Record<string, string> = {
  ready_for_collection: 'Aguardando a logística do Webag',
  awaiting_courier: 'Aguardando motoboy',
  courier_en_route: 'Motoboy a caminho da sua loja',
  out_for_delivery: 'Pedido coletado, a caminho do cliente',
  delivered: 'Entregue ao cliente',
  not_delivered: 'Entrega não realizada',
  returned_to_store: 'Pedido devolvido à loja',
  cancelled: 'Entrega cancelada',
};

export function OrderDetailPage({ orderId }: { orderId: string }) {
  return (
    <OrdersGate>
      {() => (
        <div className={s.detail}>
          <Link href={asRoute('/lojista/pedidos')} className={s.back} data-testid={T('back')}>
            <ArrowLeft size={24} aria-hidden="true" />
            Pedidos
          </Link>
          <Detail orderId={orderId} />
        </div>
      )}
    </OrdersGate>
  );
}

function Detail({ orderId }: { orderId: string }) {
  const { store } = useMerchant();
  const storeId = store.data?.id ?? '';
  const online = useOnline();
  const query = useQuery({ queryKey: ordersKeys.detail(storeId, orderId), queryFn: () => ordersApi.get(storeId, orderId), enabled: Boolean(storeId), refetchInterval: 15_000 });

  if (query.data) return <Body order={query.data} online={online} />;
  if (query.isError) {
    if (query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400)) {
      return (
        <div role="alert" data-testid={T('not-found')}>
          <PageHeader title="Não encontramos esse pedido." />
          <Link href={asRoute('/lojista/pedidos')} className="wb-text-body-strong">
            Voltar aos pedidos
          </Link>
        </div>
      );
    }
    return <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />;
  }
  return (
    <div role="status" aria-label="Carregando o pedido" data-testid="skeleton" className={s.detail}>
      <Skeleton height={48} width="60%" />
      <Skeleton height={140} />
      <Skeleton height={200} />
    </div>
  );
}

function Body({ order, online }: { order: StoreOrder; online: boolean }) {
  const router = useRouter();
  const actions = useOrderActions();
  const now = useNow(30_000);
  const [dialog, setDialog] = useState<null | 'ready' | 'complete' | 'cancel' | 'refuse'>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = actions.isBusy(order.id);
  const step = nextStep(order);
  const skip = order.status === 'accepted' ? skipStep(order) : null;
  const isNew = order.status === 'received';
  const phoneLink = whatsappHref(order.customer.phone);

  async function run(call: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    const result = await call();
    if (!result.ok && result.message) setError(result.message);
  }

  function advance(to: NonNullable<typeof step>) {
    if (to.action === 'complete') return setDialog('complete');
    if (to.to === 'ready_for_collection') return setDialog('ready');
    void run(() => actions.advance(order, to.to));
  }

  const more: MenuAction[] = [];
  if (skip && skip.to !== step?.to) more.push({ label: skip.label, onSelect: () => advance(skip), testId: T('skip-step') });
  if (order.status === 'ready_for_collection' && order.allowedActions.includes('prepare')) more.push({ label: 'Voltar para a separação', onSelect: () => void run(() => actions.advance(order, 'in_preparation')), testId: T('back-to-preparation') });
  more.push({ label: 'Imprimir comanda', onSelect: () => router.push(asRoute(`/lojista/pedidos/${order.id}/comanda?imprimir=1`)), testId: T('print') });
  if (order.allowedActions.includes('cancel')) more.push({ label: 'Cancelar pedido', danger: true, onSelect: () => setDialog('cancel'), testId: T('cancel') });

  const address = order.delivery ? addressLines(order.delivery.address) : [];
  const values = order.values;

  return (
    <>
      <div className={s.detailHead}>
        <div className={s.detailTitle}>
          <PageHeader title={`Pedido ${order.number}`} />
          <OrderStatusBadge status={order.status} testId={T('status')} />
          <ModeBadge mode={order.mode} />
        </div>
        <p className="wb-text-caption" style={{ margin: 0 }}>
          {formatClock(arrivedAt(order))} · {formatElapsed(now - Date.parse(arrivedAt(order)))}
        </p>
        <ReadyBy orderId={order.id} readyByAt={order.readyByAt} now={now} />
      </div>

      {error ? (
        <Banner tone="danger" testId={T('error')}>
          {error}
        </Banner>
      ) : null}
      {!online ? <Banner tone="warning" offline>Conecte-se para mudar o status. Nada foi alterado.</Banner> : null}

      <div className={s.nextBar} data-testid={T('actions')}>
        {isNew ? (
          <div className={s.nextRow}>
            {order.allowedActions.includes('accept') ? (
              <Button size="lg" onClick={() => void run(() => actions.accept(order))} loading={busy} loadingLabel="Aceitando…" disabled={!online} data-testid={T('accept')}>
                Aceitar pedido
              </Button>
            ) : null}
            {order.allowedActions.includes('refuse') ? (
              <Button size="lg" variant="secondary" onClick={() => setDialog('refuse')} disabled={busy || !online} data-testid={T('refuse')}>
                Recusar
              </Button>
            ) : null}
          </div>
        ) : (
          <div className={s.nextRow}>
            {step ? (
              <Button size="lg" onClick={() => advance(step)} loading={busy} loadingLabel="Atualizando…" disabled={!online} data-testid={T('next')}>
                {step.label}
              </Button>
            ) : null}
            <ActionMenu label="Mais ações do pedido" actions={more} testId={T('more')} />
          </div>
        )}
      </div>

      {order.logistics ? (
        <section className={s.block} aria-labelledby="blk-logistics" data-testid={T('logistics')}>
          <h2 id="blk-logistics" className="wb-text-title2">
            <Truck size={24} aria-hidden="true" /> Entrega pelo Webag
          </h2>
          <p className="wb-text-body" style={{ margin: 0 }}>
            {order.logistics.status ? (LOGISTICS_LABEL[order.logistics.status] ?? order.logistics.status) : 'Aguardando a logística do Webag'}
            {order.logistics.courierFirstName ? ` · ${order.logistics.courierFirstName}` : ''}
          </p>
          {order.logistics.volumes ? <p className="wb-text-caption" style={{ margin: 0 }}>{order.logistics.volumes} {order.logistics.volumes === 1 ? 'volume' : 'volumes'}</p> : null}
        </section>
      ) : null}

      <section className={s.block} aria-labelledby="blk-customer" data-testid={T('customer')}>
        <h2 id="blk-customer" className="wb-text-title2">Cliente</h2>
        <p className="wb-text-body-strong" style={{ margin: 0 }}>{order.customer.firstName}</p>
        {order.customer.phone ? (
          <p className="wb-text-body" style={{ margin: 0 }}>
            {formatPhone(order.customer.phone)}
            {phoneLink ? (
              <>
                {' · '}
                <a href={phoneLink} target="_blank" rel="noopener noreferrer" className={s.linkButton} data-testid={T('whatsapp')}>
                  <ChatCircleText size={24} aria-hidden="true" />
                  Falar no WhatsApp
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {order.mode === 'delivery' ? (
          <address className="wb-text-body" style={{ margin: 0, fontStyle: 'normal' }} data-testid={T('address')}>
            {address.length > 0 ? address.map((line) => <span key={line} style={{ display: 'block' }}>{line}</span>) : 'Endereço do cliente com a logística do Webag.'}
          </address>
        ) : (
          <p className={cx('wb-text-body-strong', s.pickupNote)} data-testid={T('address')}>
            <Bag size={24} aria-hidden="true" /> RETIRADA: peça o código de 4 dígitos ao cliente.
          </p>
        )}
      </section>

      <section className={s.block} aria-labelledby="blk-items" data-testid={T('items')}>
        <h2 id="blk-items" className="wb-text-title2">Itens</h2>
        <ul className={s.itemList}>
          {order.items.map((item, index) => (
            <li key={index} className={s.itemRow}>
              <span className={s.itemThumb} aria-hidden="true">
                <Bag size={24} />
              </span>
              <span className={s.itemText}>
                <span className="wb-text-body-strong">{item.name}</span>
                {Object.keys(item.attributes).length > 0 ? <span className={cx('wb-text-body-strong', s.variation)}>{attributesText(item.attributes)}</span> : null}
              </span>
              <span className={cx('wb-text-title2', s.itemQty)} aria-label={`Quantidade ${item.quantity}`}>{item.quantity}x</span>
            </li>
          ))}
        </ul>
      </section>

      {values ? (
        <section className={s.block} aria-labelledby="blk-values" data-testid={T('summary')}>
          <h2 id="blk-values" className="wb-text-title2">Valores</h2>
          <dl className={s.sum}>
            <dt>Venda (produtos)</dt>
            <dd>{formatCents(values.subtotal.amount)}</dd>
            {values.storeDiscount.amount > 0 ? (
              <>
                <dt>Desconto da loja</dt>
                <dd>- {formatCents(values.storeDiscount.amount)}</dd>
              </>
            ) : null}
            <dt>Comissão do Webag</dt>
            <dd>- {formatCents(values.commission.amount)}</dd>
            <dt className={s.sumStrong}>Você recebe (antes da tarifa do pagamento)</dt>
            <dd className={s.sumStrong}>{formatCents(values.netBeforeProviderFee.amount)}</dd>
          </dl>
        </section>
      ) : null}

      <section className={s.block} aria-labelledby="blk-timeline" data-testid={T('timeline')}>
        <h2 id="blk-timeline" className="wb-text-title2">Andamento</h2>
        <ol className={s.timeline}>
          {order.timeline.map((entry, index) => (
            <li key={index} className={s.timelineItem}>
              <span className="wb-text-caption-strong">{formatFullDateTime(entry.at)}</span>
              <span className="wb-text-body">
                {ORDER_STATUS_LABEL[entry.status]} · {ACTOR_LABEL[entry.actor]}
                {entry.reason ? ` (${entry.reason})` : ''}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {order.status === 'accepted' || order.status === 'in_preparation' || order.status === 'ready_for_collection' ? (
        <Button variant="secondary" icon={<Printer size={24} aria-hidden="true" />} onClick={() => router.push(asRoute(`/lojista/pedidos/${order.id}/comanda`))} data-testid={T('print-ticket')}>
          Imprimir comanda
        </Button>
      ) : null}

      {dialog === 'ready' ? <ReadyDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === 'complete' ? <CompleteDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === 'refuse' ? <RejectDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? (
        <ReasonDialog
          title={`Cancelar o pedido ${order.number}?`}
          description="O cliente recebe o valor de volta e o cancelamento conta no índice da sua loja."
          minReason={3}
          confirmLabel="Cancelar pedido"
          destructive
          onConfirm={async (reason) => {
            const result = await actions.cancel(order, reason);
            if (!result.ok) throw new UserMessageError(result.message);
          }}
          onClose={() => setDialog(null)}
          testIds={{ dialog: T('reason-dialog'), reason: T('reason'), confirm: T('reason-confirm') }}
        />
      ) : null}
    </>
  );
}
