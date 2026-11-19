'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, Dialog, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { countdownText, logisticsApi, logisticsKeys, pendingLateCancel, type Delivery } from '@/lib/api/logistics';
import { tid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { useOnline } from '@/lib/use-online';
import s from './logistics.module.css';

const T = (id: string) => tid('logistica', id);

function respondError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return 'Conecte-se para responder. Nada foi alterado.';
    if (error.code === 'NO_CANCEL_REQUEST') return 'Este pedido de cancelamento já foi respondido. Atualizamos a tela.';
    if (error.status === 403) return 'Você não tem permissão para responder.';
  }
  return 'Não foi possível responder. Nada foi alterado. Tente de novo.';
}

/** Número do pedido para o texto ("E-2026" no protótipo; aqui o número real). */
function label(delivery: Pick<Delivery, 'orderNumber'>): string {
  return delivery.orderNumber ? `#${delivery.orderNumber}` : 'O pedido';
}

/**
 * Pedido de cancelamento por atraso com o pedido em saída (WB-255 C6, `onda-7-paineis-v3.md` §3.3). A API devolve `respondBy`;
 * sem resposta até lá o sistema aceita sozinho. Só quem despacha vê os botões.
 */
export function LateCancelStrip({ delivery, canWrite }: { delivery: Delivery; canWrite: boolean }) {
  const request = pendingLateCancel(delivery);
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const now = useNow(1000);
  const [busy, setBusy] = useState<'arrive_soon' | 'accept' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!request) return null;

  async function respond(action: 'arrive_soon' | 'accept') {
    if (!online) {
      setError('Conecte-se para responder. Nada foi alterado.');
      return;
    }
    setBusy(action);
    setError(null);
    try {
      await logisticsApi.respondLateCancel(delivery.orderId, { action });
      toast.show(action === 'arrive_soon' ? 'O cliente foi avisado: chega em até 10 min. Sem a entrega até lá, o cancelamento é aceito.' : 'Cancelamento aceito. Avise o motoboy para devolver o pacote à loja. O estorno é total, com a entrega.');
      setConfirming(false);
    } catch (caught) {
      setError(respondError(caught));
    } finally {
      setBusy(null);
      void client.invalidateQueries({ queryKey: logisticsKeys.all });
    }
  }

  return (
    <div className={s.strip} data-testid={T(`cancel-request-${delivery.id}`)}>
      <div className={s.stripText}>
        <p className="wb-text-body-strong" style={{ margin: 0 }}>O cliente pediu cancelamento por atraso</p>
        <p className="wb-text-body" style={{ margin: 0 }}>
          {label(delivery)}: responda em <strong data-testid={T(`cancel-request-${delivery.id}-countdown`)}>{countdownText(request.respondBy, now)}</strong>. Sem resposta, o sistema aceita e o pacote volta à loja.
        </p>
        {error ? <Banner tone="danger" testId={T(`cancel-request-${delivery.id}-error`)}>{error}</Banner> : null}
      </div>
      {canWrite ? (
        <div className={s.stripActions}>
          <Button size="sm" onClick={() => void respond('arrive_soon')} loading={busy === 'arrive_soon'} loadingLabel="Avisando…" disabled={busy !== null} data-testid={T(`cancel-request-${delivery.id}-arrive`)}>Chego em até 10 min</Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirming(true)} disabled={busy !== null} data-testid={T(`cancel-request-${delivery.id}-accept`)}>Aceitar cancelamento</Button>
        </div>
      ) : null}
      {confirming ? (
        <Dialog
          title="Aceitar o cancelamento?"
          onClose={() => setConfirming(false)}
          locked={busy === 'accept'}
          testId={T(`cancel-request-${delivery.id}-confirm`)}
          actions={
            <>
              <Button variant="destructive" onClick={() => void respond('accept')} loading={busy === 'accept'} loadingLabel="Aceitando…" data-testid={T(`cancel-request-${delivery.id}-accept-confirm`)}>Aceitar cancelamento</Button>
              <Button variant="text" onClick={() => setConfirming(false)} disabled={busy === 'accept'}>Voltar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>A corrida vira devolução e o pacote volta à loja. O estorno ao cliente é total, com a entrega. Não dá para desfazer.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
