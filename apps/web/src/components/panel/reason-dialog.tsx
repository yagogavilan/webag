'use client';

import { useState, type ReactNode } from 'react';
import { Banner, Button, Dialog, TextArea } from '@/components/ui';
import { saveErrorMessage } from '@/lib/api/messages';
import { DiffView, type DiffRow } from './diff-view';

/** Erro com texto já pronto para o lojista/admin (a tela que chamou sabe o que dizer). */
export class UserMessageError extends Error {}

export const REASON_MIN = 10;
export const REASON_MAX = 200;
const REASON_HARD_MAX = 500;

export function reasonError(reason: string, min: number = REASON_MIN, noun = 'o motivo'): string | undefined {
  return reason.trim().length < min ? `Escreva ${noun} (mínimo ${min} caracteres).` : undefined;
}

interface Props {
  /** Repete o nome do alvo: "Alterar Tempo para pagar o PIX?". */
  title: string;
  description?: ReactNode;
  diff?: DiffRow[];
  /**
   * Pede o motivo (10 a 200). Só passe `false` quando o endpoint ainda não aceita `reason` (pendência registrada
   * no retorno da Onda 1A): o campo existe no padrão, mas enviar um campo que a API recusa (400) seria pior.
   */
  withReason?: boolean;
  quickReasons?: string[];
  /** Mínimo de caracteres do motivo (padrão 10; a redefinição de acesso exige 20, SEC-094). */
  minReason?: number;
  /** Limite do contador (padrão 200). */
  maxReason?: number;
  /** Rótulo do campo (padrão "Motivo"; "Nota" ao encerrar um alerta) e o trecho da mensagem de erro ("a nota"). */
  fieldLabel?: string;
  fieldNoun?: string;
  /** Valida o que o `extra` pede; devolve a mensagem de erro (o botão continua ativo e o erro aparece ao tocar, DEC-024d). */
  precheck?: () => string | null;
  /** "[Verbo] [alvo]": "Fechar cidade", "Salvar parâmetro". */
  confirmLabel: string;
  destructive?: boolean;
  extra?: ReactNode;
  /** Se der erro, o Dialog continua aberto com o erro. Se resolver, fecha. */
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
  testIds?: { dialog?: string; reason?: string; confirm?: string; cancel?: string };
  /** Texto do erro fixo que a tela quer mostrar acima do botão (ex.: trava de último meio de pagamento). */
  warning?: ReactNode;
}

/** Padrão "Motivo" do admin (onda-1b §AD0). Falha fechada: se a auditoria não gravar, a ação não acontece e o erro aparece aqui. */
export function ReasonDialog({ title, description, diff, withReason = true, quickReasons, minReason = REASON_MIN, maxReason = REASON_MAX, fieldLabel = 'Motivo', fieldNoun = 'o motivo', precheck, confirmLabel, destructive, extra, onConfirm, onClose, testIds, warning }: Props) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalid = withReason ? reasonError(reason, minReason, fieldNoun) : undefined;

  async function confirm() {
    setTouched(true);
    const pre = precheck?.() ?? null;
    if (invalid || pre) {
      setError(pre);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (caught) {
      setError(caught instanceof UserMessageError ? caught.message : saveErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      locked={busy}
      testId={testIds?.dialog ?? 'confirm-dialog'}
      actions={
        <>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={() => void confirm()} loading={busy} loadingLabel="Salvando…" data-testid={testIds?.confirm ?? 'confirm'}>
            {confirmLabel}
          </Button>
          <Button variant="text" onClick={onClose} disabled={busy} data-testid={testIds?.cancel ?? 'cancel'}>
            Cancelar
          </Button>
        </>
      }
    >
      {description ? <div className="wb-text-body">{description}</div> : null}
      {diff && diff.length > 0 ? <DiffView rows={diff} /> : null}
      {extra}
      {warning}
      {withReason ? (
        <>
          {quickReasons?.length ? (
            <div role="group" aria-label="Motivos comuns" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {quickReasons.map((quick) => (
                <button key={quick} type="button" className="wb-text-caption-strong" onClick={() => setReason(quick)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 9999, border: '1px solid var(--wb-color-border-strong)', background: 'var(--wb-color-surface-sunken)', cursor: 'pointer' }}>
                  {quick}
                </button>
              ))}
            </div>
          ) : null}
          <TextArea label={fieldLabel} value={reason} onChange={(event) => setReason(event.target.value.slice(0, Math.min(maxReason, REASON_HARD_MAX)))} counter={{ value: reason.length, max: maxReason }} error={touched ? invalid : undefined} rows={3} data-testid={testIds?.reason ?? 'reason-input'} />
        </>
      ) : null}
      {error ? <Banner tone="danger" testId="reason-error">{error}</Banner> : null}
    </Dialog>
  );
}
