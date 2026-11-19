'use client';

import { useState } from 'react';
import { Banner, Button, Dialog, RadioCards, TextArea } from '@/components/ui';
import { REFUSE_OTHER_MAX, REFUSE_REASONS, refuseReasonText, type RefuseReasonId } from '@/lib/orders/status';
import type { StoreOrderSummary } from '@/lib/api/orders';
import { ltid } from '@/lib/testid';
import s from './orders.module.css';
import { useOrderActions } from './use-order-actions';

const T = (id: string) => ltid('reject', id);

type OrderRef = Pick<StoreOrderSummary, 'id' | 'number'>;

/**
 * "Por que recusar?" (P1): motivo obrigatório; "Outro" pede texto (até 140). O botão fica ativo e o erro aparece ao tocar (DEC-024d).
 * Serve ao diálogo do cartão e ao alerta de pedido novo (que o mostra no próprio modal, sem empilhar diálogos).
 */
export function useRejectForm(order: OrderRef, onDone: () => void) {
  const actions = useOrderActions();
  const [reasonId, setReasonId] = useState<RefuseReasonId | null>(null);
  const [other, setOther] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = actions.isBusy(order.id);

  const text = refuseReasonText(reasonId, other);
  const fieldError = !touched || text ? undefined : reasonId === 'other' ? 'Escreva o motivo (mínimo 3 caracteres).' : 'Escolha um motivo.';

  async function submit() {
    setTouched(true);
    setError(null);
    if (!text) return;
    const result = await actions.refuse(order, text);
    if (result.ok) onDone();
    else setError(result.message);
  }
  return { reasonId, setReasonId, other, setOther, fieldError, error, busy, submit };
}

export function RejectFields({ form, legendTestId }: { form: ReturnType<typeof useRejectForm>; legendTestId?: string }) {
  return (
    <div className={s.reasons} data-testid={legendTestId}>
      <RadioCards
        legend="Motivo da recusa"
        name="refuse-reason"
        value={form.reasonId}
        onChange={form.setReasonId}
        options={REFUSE_REASONS.map((reason) => ({ value: reason.id, label: reason.label, testId: T(`reason-${reason.id}`) }))}
      />
      {form.reasonId === 'other' ? (
        <TextArea label="Motivo" value={form.other} onChange={(event) => form.setOther(event.target.value.slice(0, REFUSE_OTHER_MAX))} counter={{ value: form.other.length, max: REFUSE_OTHER_MAX }} rows={3} data-testid={T('text')} error={form.fieldError} />
      ) : form.fieldError ? (
        <p className="wb-text-caption" role="alert" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>
          {form.fieldError}
        </p>
      ) : null}
      {form.error ? <Banner tone="danger">{form.error}</Banner> : null}
    </div>
  );
}

export function RejectDialog({ order, onClose }: { order: OrderRef; onClose: () => void }) {
  const form = useRejectForm(order, onClose);
  return (
    <Dialog
      title="Por que recusar?"
      onClose={onClose}
      locked={form.busy}
      testId="lojista.reject.dialog"
      actions={
        <>
          <Button variant="destructive" onClick={() => void form.submit()} loading={form.busy} loadingLabel="Recusando…" data-testid={T('submit')}>
            Recusar pedido
          </Button>
          <Button variant="text" onClick={onClose} disabled={form.busy}>
            Voltar
          </Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>
        Pedido {order.number}. O cliente recebe o valor de volta.
      </p>
      <RejectFields form={form} />
    </Dialog>
  );
}
