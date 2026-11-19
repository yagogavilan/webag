'use client';

import { useState } from 'react';
import { Banner, Button, Dialog, OtpInput } from '@/components/ui';
import type { StoreOrderSummary } from '@/lib/api/orders';
import { supportHref } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import { useOrderActions } from './use-order-actions';

const T = (id: string) => ltid('order', id);

const MAX_ATTEMPTS = 5;

/**
 * Concluir o pedido. Entrega: "Marcar como entregue?" (conclui e inicia o repasse). Retirada: o código de 4 dígitos que o cliente
 * informa no balcão (WB-069 C3). A API só valida o código (422 `PICKUP_CODE_INVALID`); o limite de 5 tentativas da spec ainda
 * não existe no servidor, então a contagem abaixo é só deste aparelho e o bloqueio real é pendência de contrato.
 */
export function CompleteDialog({ order, onClose, onDone }: { order: Pick<StoreOrderSummary, 'id' | 'number' | 'mode'>; onClose: () => void; onDone?: () => void }) {
  const actions = useOrderActions();
  const pickup = order.mode === 'pickup';
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const busy = actions.isBusy(order.id);
  const blocked = attempts >= MAX_ATTEMPTS;

  async function submit(value: string = code) {
    setError(null);
    if (pickup && blocked) return;
    if (pickup && !/^\d{4}$/.test(value)) {
      setWrong(true);
      setError('Digite os 4 dígitos do código do cliente.');
      return;
    }
    const result = await actions.advance(order, 'delivered', pickup ? value : undefined);
    if (result.ok) {
      onDone?.();
      onClose();
      return;
    }
    if (pickup && result.message.startsWith('Código incorreto')) {
      const used = attempts + 1;
      setAttempts(used);
      setWrong(true);
      setCode('');
      setError(used >= MAX_ATTEMPTS ? 'Muitas tentativas. Peça ajuda ao Webag.' : `Código incorreto. Restam ${MAX_ATTEMPTS - used} tentativas.`);
      return;
    }
    setError(result.message);
  }

  return (
    <Dialog
      title={pickup ? 'Entregar com código' : 'Marcar como entregue?'}
      onClose={onClose}
      locked={busy}
      testId="lojista.order.complete-dialog"
      actions={
        <>
          <Button onClick={() => void submit()} loading={busy} loadingLabel="Concluindo…" disabled={pickup && blocked} data-testid={pickup ? T('pickup-code-submit') : T('delivered-confirm')}>
            {pickup ? 'Entregar pedido' : 'Marcar como entregue'}
          </Button>
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
        </>
      }
    >
      {pickup ? (
        <>
          <p className="wb-text-body" style={{ margin: 0 }}>
            Peça o código de 4 dígitos ao cliente. Pedido {order.number}.
          </p>
          <OtpInput length={4} label="Código do cliente" value={code} onChange={(value) => { setCode(value); setWrong(false); }} onComplete={(value) => void submit(value)} invalid={wrong} disabled={busy || blocked} testId={T('pickup-code-input')} autoFocus />
        </>
      ) : (
        <p className="wb-text-body" style={{ margin: 0 }}>
          Isso conclui o pedido e inicia o seu repasse.
        </p>
      )}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {pickup && blocked ? (
        <a className="wb-text-body-strong" href={supportHref()} target="_blank" rel="noopener noreferrer">
          Falar com o suporte
        </a>
      ) : null}
    </Dialog>
  );
}
