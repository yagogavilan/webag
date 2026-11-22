'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Dialog, SelectField, TextArea } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { VIEW_AS_REASON_LABEL, viewAsApi, type ViewAsOpened, type ViewAsReasonCode } from '@/lib/api/view-as';
import { T } from './banner';
import { readLastReason, saveLastReason } from './use-view-as';

const NOTE_MAX = 200;
const CODES = Object.keys(VIEW_AS_REASON_LABEL) as ViewAsReasonCode[];

/** Texto do erro de abertura (spec 4.2 e 4.5). Nunca mostra `code` nem cabeçalho. */
export function openErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return 'Sem conexão. A visualização não abriu. Conecte-se e tente de novo.';
    if (error.status === 429) return 'Muitas aberturas. Tente em alguns minutos.';
    if (error.status === 403) return 'Você não tem acesso a essa área. Peça ao administrador para liberar o seu perfil.';
  }
  return 'Não conseguimos abrir a visualização agora. Tente de novo em instantes.';
}

interface Props {
  storeId: string;
  storeName: string;
  /** Já existe uma visão aberta (de qualquer loja): avisa que abrir esta fecha a anterior (C10). */
  hasOpen: boolean;
  /** Reabrir depois de terminar: o motivo anterior vem preenchido. */
  reopen?: boolean;
  onOpened: (opened: ViewAsOpened) => void;
  onClose: () => void;
}

/** Abrir "Ver como o lojista" (WB-352 C2, C9, C10): motivo obrigatório; nada abre antes de a API gravar a auditoria. */
export function OpenViewAsDialog({ storeId, storeName, hasOpen, reopen, onOpened, onClose }: Props) {
  const [previous] = useState(() => (reopen ? readLastReason() : null));
  const initial = previous && (CODES as string[]).includes(previous.code) ? (previous.code as ViewAsReasonCode) : '';
  const [code, setCode] = useState<ViewAsReasonCode | ''>(initial);
  const [note, setNote] = useState(initial === 'other' ? (previous?.note ?? '') : '');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    // O Dialog leva o foco ao título ao montar; o foco inicial desta tela é a lista de motivos.
    const timer = setTimeout(() => select.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  async function open() {
    if (!code) {
      setFieldError('Escolha o motivo para abrir.');
      select.current?.focus();
      return;
    }
    if (code === 'other' && note.trim().length === 0) {
      setFieldError('Descreva o motivo em poucas palavras.');
      return;
    }
    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      const reason = code === 'other' || note.trim() ? { code, note: note.trim() } : { code };
      const opened = await viewAsApi.open(storeId, reason);
      saveLastReason({ code, ...(code === 'other' ? { note: note.trim() } : {}) });
      onOpened(opened);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) setFieldError(code === 'other' ? 'Descreva o motivo em poucas palavras.' : 'Escolha o motivo para abrir.');
      else setError(openErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Ver como o lojista"
      onClose={onClose}
      locked={busy}
      testId={T('open-dialog')}
      actions={
        <>
          <Button onClick={() => void open()} loading={busy} loadingLabel="Abrindo…" aria-busy={busy} data-testid={T('open-confirm')}>
            Abrir visualização
          </Button>
          <Button variant="text" onClick={onClose} disabled={busy} data-testid={T('open-cancel')}>
            Cancelar
          </Button>
        </>
      }
    >
      <p className="wb-text-body" style={{ margin: 0 }}>
        Você vai ver as telas de {storeName} do jeito que o lojista vê, <strong>sem poder alterar nada</strong>. Dados pessoais de clientes não aparecem. A abertura fica registrada com o seu nome e o motivo.
      </p>
      <p className="wb-text-body" style={{ margin: 0 }}>Dura até 30 minutos e não renova. Para continuar depois, abra de novo.</p>
      {hasOpen ? <Banner tone="warning" testId={T('replace-note')}>Você já tem uma visualização aberta. Abrir esta fecha a anterior.</Banner> : null}
      <SelectField
        ref={select}
        label="Motivo"
        value={code}
        onChange={(event) => {
          setCode(event.target.value as ViewAsReasonCode | '');
          setFieldError(null);
        }}
        error={fieldError && code !== 'other' ? fieldError : undefined}
        hint={initial && code === initial ? 'Mesmo motivo da visualização anterior. Troque se mudou.' : undefined}
        data-testid={T('reason')}
      >
        <option value="">Escolha o motivo</option>
        {CODES.map((option) => (
          <option key={option} value={option}>
            {VIEW_AS_REASON_LABEL[option]}
          </option>
        ))}
      </SelectField>
      {code === 'other' ? (
        <TextArea label="Descreva o motivo (até 200 caracteres)" value={note} onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))} counter={{ value: note.length, max: NOTE_MAX }} error={fieldError ?? undefined} rows={3} data-testid={T('reason-note')} />
      ) : null}
      {error ? (
        <Banner tone="danger" testId={T('open-error')}>
          {error}
        </Banner>
      ) : null}
    </Dialog>
  );
}
