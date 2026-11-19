'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, SolarIcon, cx } from '@/components/ui';
import type { StoreOrderSummary } from '@/lib/api/orders';
import { formatCents, formatClock } from '@/lib/format';
import { arrivedAt, elapsedTone, formatElapsed, nextStep } from '@/lib/orders/status';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { CompleteDialog } from './complete-dialog';
import { ReadyDialog } from './ready-dialog';
import { ModeBadge, OrderStatusBadge } from './status-badge';
import s from './orders.module.css';
import { RejectDialog } from './reject-form';
import { useOrderActions } from './use-order-actions';

const T = (id: string) => ltid('orders', id);

/** "há 2 min", em alerta a partir de 5 min e em erro a partir de 8, sempre com ícone (contraste não depende só da cor). */
export function Elapsed({ order, now }: { order: Pick<StoreOrderSummary, 'paidAt' | 'createdAt'>; now: number }) {
  const ms = now - Date.parse(arrivedAt(order));
  const tone = elapsedTone(Math.floor(ms / 60_000));
  return (
    <span className={cx('wb-text-caption-strong', s.elapsed, tone === 'warning' && s.elapsedWarning, tone === 'danger' && s.elapsedDanger)}>
      {tone === 'warning' ? <SolarIcon name="warning" size={16} duotone /> : null}
      {tone === 'danger' ? <SolarIcon name="alert" size={16} duotone /> : null}
      {formatElapsed(ms)}
    </span>
  );
}

interface Props {
  order: StoreOrderSummary;
  now: number;
  online: boolean;
}

/** OrderCard (design-system): número, hora, tempo desde a chegada, tipo, itens, total, "Pago" e a ação do estado. */
export function OrderCard({ order, now, online }: Props) {
  const actions = useOrderActions();
  const [rejecting, setRejecting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [readying, setReadying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = actions.isBusy(order.id);
  const isNew = order.status === 'received';
  const step = nextStep(order);
  const canAccept = order.allowedActions.includes('accept');
  const canRefuse = order.allowedActions.includes('refuse');
  const offlineHintId = `${order.id}-offline`;
  const left = isNew && order.acceptDeadlineAt ? Math.max(0, Date.parse(order.acceptDeadlineAt) - now) : null;

  async function accept() {
    setError(null);
    const result = await actions.accept(order);
    if (!result.ok) setError(result.message);
  }

  async function advance() {
    if (!step) return;
    if (step.action === 'complete') {
      setCompleting(true);
      return;
    }
    if (step.to === 'ready_for_collection') {
      setReadying(true);
      return;
    }
    setError(null);
    const result = await actions.advance(order, step.to);
    if (!result.ok) setError(result.message);
  }

  return (
    <li>
      <article className={cx(s.card, isNew && s.cardNew)} aria-label={`Pedido ${order.number}`} data-testid={T(`card-${order.id}`)}>
        <header className={s.cardHead}>
          <Link href={asRoute(`/lojista/pedidos/${order.id}`)} className={cx('wb-text-title2', s.cardNumber)}>
            {order.number}
          </Link>
          <span className={s.cardTimes}>
            <span className="wb-text-caption">{formatClock(arrivedAt(order))}</span>
            <Elapsed order={order} now={now} />
          </span>
        </header>
        <div className={s.meta}>
          <ModeBadge mode={order.mode} />
          {isNew ? null : <OrderStatusBadge status={order.status} />}
          <Badge tone="success" icon={<SolarIcon name="check" size={16} duotone />}>
            Pago no app
          </Badge>
        </div>
        <p className={cx('wb-text-body', s.items)}>
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'} · {order.firstItemName}
          {order.itemCount > 1 ? ` +${order.itemCount - 1}` : ''}
        </p>
        {order.total ? <p className={cx('wb-text-title2', s.total)}>{formatCents(order.total.amount)}</p> : null}
        {left !== null ? (
          <p className={s.countdown} data-testid={T(`card-${order.id}-countdown`)}>
            <span className={s.countdownValue}>{`${String(Math.floor(left / 60_000)).padStart(2, '0')}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}`}</span>
            <span className={cx('wb-text-caption', s.countdownText)}>para responder. Sem resposta, o pedido é cancelado.</span>
          </p>
        ) : null}
        {error ? (
          <p className="wb-text-caption" role="alert" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>
            {error}
          </p>
        ) : null}
        {isNew && (canAccept || canRefuse) ? (
          <>
            <div className={s.actions}>
              {canAccept ? (
                <button type="button" className={s.accept} onClick={() => void accept()} disabled={busy || !online} aria-busy={busy || undefined} aria-label={`Aceitar pedido ${order.number}`} aria-describedby={online ? undefined : offlineHintId} data-testid={T(`card-${order.id}-accept`)}>
                  {busy ? 'Aceitando…' : 'Aceitar pedido'}
                </button>
              ) : null}
              {canRefuse ? (
                <Button size="lg" variant="secondary" className={s.refuse} onClick={() => setRejecting(true)} disabled={busy || !online} aria-label={`Recusar pedido ${order.number}`} aria-describedby={online ? undefined : offlineHintId} data-testid={T(`card-${order.id}-reject`)}>
                  Recusar
                </Button>
              ) : null}
            </div>
            {online ? null : (
              <p id={offlineHintId} className={cx('wb-text-caption', s.cardHint)}>
                Conecte-se para aceitar. O pedido continua esperando.
              </p>
            )}
          </>
        ) : null}
        {step ? (
          <>
            <Button size="lg" onClick={() => void advance()} loading={busy} loadingLabel="Atualizando…" disabled={!online} aria-describedby={online ? undefined : offlineHintId} data-testid={T(`card-${order.id}-next`)}>
              {step.label}
            </Button>
            {online ? null : (
              <p id={offlineHintId} className={cx('wb-text-caption', s.cardHint)}>
                Conecte-se para mudar o status. Nada foi alterado.
              </p>
            )}
          </>
        ) : null}
      </article>
      {rejecting ? <RejectDialog order={order} onClose={() => setRejecting(false)} /> : null}
      {readying ? <ReadyDialog order={order} onClose={() => setReadying(false)} /> : null}
      {completing ? <CompleteDialog order={order} onClose={() => setCompleting(false)} /> : null}
    </li>
  );
}
