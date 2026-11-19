'use client';

import { useState } from 'react';
import { Banner, Button, Dialog, TextArea, TextField } from '@/components/ui';
import type { StoreOrderSummary } from '@/lib/api/orders';
import { ltid } from '@/lib/testid';
import { useOrderActions } from './use-order-actions';

const T = (id: string) => ltid('ready', id);
const NOTE_MAX = 100;

/**
 * "Pronto para coleta" (entrega Webag, DEC-036): a loja informa quantos volumes e, se quiser, uma observação para o motoboy.
 * O botão de enviar fica sempre ativo: o que estiver fora da regra aparece como erro no campo ao tocar (DEC-024d).
 */
export function ReadyDialog({ order, onClose, onDone }: { order: Pick<StoreOrderSummary, 'id' | 'number'>; onClose: () => void; onDone?: () => void }) {
  const actions = useOrderActions();
  const [volumes, setVolumes] = useState('1');
  const [note, setNote] = useState('');
  const [volumesError, setVolumesError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const busy = actions.isBusy(order.id);

  async function submit() {
    setError(null);
    const count = Number(volumes);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setVolumesError('Informe de 1 a 99 volumes.');
      return;
    }
    setVolumesError(undefined);
    const result = await actions.advance(order, 'ready_for_collection', { volumes: count, note });
    if (result.ok) {
      onDone?.();
      onClose();
      return;
    }
    setError(result.message);
  }

  return (
    <Dialog
      title={`Pedido ${order.number} pronto para coleta?`}
      onClose={onClose}
      locked={busy}
      testId={T('dialog')}
      actions={
        <>
          <Button size="lg" onClick={() => void submit()} loading={busy} loadingLabel="Avisando…" data-testid={T('confirm')}>
            Pronto para coleta
          </Button>
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy} data-testid={T('cancel')}>
            Voltar
          </Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>
        A logística do Webag recebe o aviso e envia um motoboy até a sua loja. Deixe o pedido embalado e separado.
      </p>
      <TextField label="Quantos volumes" type="number" inputMode="numeric" min={1} max={99} value={volumes} onChange={(event) => setVolumes(event.target.value)} error={volumesError} data-testid={T('volumes')} />
      <TextArea label="Observação para o motoboy (opcional)" value={note} maxLength={NOTE_MAX} counter={{ value: note.length, max: NOTE_MAX }} onChange={(event) => setNote(event.target.value)} rows={2} data-testid={T('note')} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
