'use client';

import { Timer } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, Dialog } from '@/components/ui';
import { ordersApi, ordersKeys, type StoreOrderSummary } from '@/lib/api/orders';
import { formatCents } from '@/lib/format';
import { attributesText, formatCountdown } from '@/lib/orders/status';
import { ltid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { useOnline } from '@/lib/use-online';
import { useOrdersRuntime } from './orders-runtime';
import s from './orders.module.css';
import { RejectFields, useRejectForm } from './reject-form';
import { ModeBadge } from './status-badge';
import { useOrderActions } from './use-order-actions';

const T = (id: string) => ltid('alert', id);

/** "89 reais e 90 centavos" para o leitor de tela. */
function spokenMoney(cents: number): string {
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const r = `${reais} ${reais === 1 ? 'real' : 'reais'}`;
  return centavos === 0 ? r : `${r} e ${centavos} ${centavos === 1 ? 'centavo' : 'centavos'}`;
}

/**
 * OrderAlert: o pedido novo mais antigo, por cima de tudo (tela cheia no celular, modal no balcão) enquanto houver pedido
 * esperando. Sem fechar: ou aceita, ou recusa com motivo (ou o cliente cancela / outro funcionário age, e ele some sozinho).
 */
export function OrderAlertHost() {
  const { enabled, pending } = useOrdersRuntime();
  const first = pending[0];
  if (!enabled || !first) return null;
  return <OrderAlert key={first.id} order={first} queue={pending.length} />;
}

function OrderAlert({ order, queue }: { order: StoreOrderSummary; queue: number }) {
  const runtime = useOrdersRuntime();
  const actions = useOrderActions();
  const online = useOnline();
  const now = useNow(1000);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reject = useRejectForm(order, () => setRejecting(false));
  const detail = useQuery({ queryKey: ordersKeys.detail(runtime.storeId ?? '', order.id), queryFn: () => ordersApi.get(runtime.storeId as string, order.id), enabled: Boolean(runtime.storeId), staleTime: 30_000 });
  const busy = actions.isBusy(order.id);
  const remaining = order.acceptDeadlineAt ? Date.parse(order.acceptDeadlineAt) - now : null;
  const total = order.total?.amount;

  async function accept() {
    setError(null);
    const result = await actions.accept(order);
    if (!result.ok) setError(result.message);
  }

  return (
    <Dialog
      alert
      fullOnMobile
      locked
      title={rejecting ? 'Por que recusar?' : 'Pedido novo'}
      onClose={() => undefined}
      testId={T('modal')}
      actions={
        rejecting ? (
          <>
            <Button size="lg" variant="destructive" onClick={() => void reject.submit()} loading={reject.busy} loadingLabel="Recusando…" disabled={!online} data-testid="lojista.reject.submit">
              Recusar pedido
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setRejecting(false)} disabled={reject.busy}>
              Voltar
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" onClick={() => void accept()} loading={busy} loadingLabel="Aceitando…" disabled={!online} aria-label={`Aceitar pedido ${order.number}`} data-testid={T('accept')}>
              Aceitar
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setRejecting(true)} disabled={busy || !online} aria-label={`Recusar pedido ${order.number}`} data-testid={T('reject')}>
              Recusar
            </Button>
          </>
        )
      }
    >
      {queue > 1 ? (
        <p className={`wb-text-caption-strong ${s.alertQueue}`} data-testid={T('queue')}>
          {queue} pedidos novos
        </p>
      ) : null}
      {rejecting ? (
        <>
          <p className="wb-text-body" style={{ margin: 0 }}>
            Pedido {order.number}. O cliente recebe o valor de volta.
          </p>
          <RejectFields form={reject} />
        </>
      ) : (
        <div className={s.alert}>
          <p className="wb-text-body-strong" style={{ margin: 0 }}>
            Pedido {order.number}
          </p>
          {total !== undefined ? (
            <p className={`wb-text-display ${s.alertTotal}`} aria-label={`Total: ${spokenMoney(total)}`}>
              {formatCents(total)}
            </p>
          ) : null}
          <p className="wb-text-body" style={{ margin: 0 }}>
            {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}
          </p>
          <div>
            <ModeBadge mode={order.mode} />
          </div>
          {detail.data ? (
            <ul className={s.alertItems} aria-label="Itens do pedido">
              {detail.data.items.slice(0, 6).map((item, index) => (
                <li key={index} className="wb-text-body">
                  {item.quantity}x {item.name}
                  {Object.keys(item.attributes).length > 0 ? ` · ${attributesText(item.attributes)}` : ''}
                </li>
              ))}
              {detail.data.items.length > 6 ? <li className="wb-text-caption">+{detail.data.items.length - 6} no detalhe do pedido</li> : null}
            </ul>
          ) : (
            <p className="wb-text-body" style={{ margin: 0 }}>
              {order.firstItemName}
              {order.itemCount > 1 ? ` +${order.itemCount - 1}` : ''}
            </p>
          )}
          {remaining !== null ? (
            <p className={`wb-text-body-strong ${s.alertTimer}`} data-testid={T('timer')}>
              <Timer size={24} aria-hidden="true" />
              {remaining > 0 ? `Responda em ${formatCountdown(remaining)}` : 'Prazo encerrado. O pedido está sendo cancelado.'}
            </p>
          ) : null}
          {runtime.sound.enabled ? null : (
            <Banner tone="danger" testId={T('sound-off')} action={<Button size="sm" onClick={() => void runtime.sound.enable()} data-testid={T('sound-enable')}>Ligar som</Button>}>
              Alertas sem som. Ligue o som para ouvir os próximos pedidos.
            </Banner>
          )}
          {online ? null : <p className="wb-text-caption" style={{ margin: 0 }}>Conecte-se para aceitar. O pedido continua esperando.</p>}
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </div>
      )}
    </Dialog>
  );
}
