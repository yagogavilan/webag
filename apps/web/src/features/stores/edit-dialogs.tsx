'use client';

import { useState, type ReactNode } from 'react';
import { AdminReasonFields, reasonPayload, saveSessionReason, useReasonState, validateReason, type ReasonValue } from '@/components/panel/admin-reason';
import { Banner, Button, Dialog, RadioCards, TextArea, TextField } from '@/components/ui';
import { adminStoresApi, type AdminStoreOverview } from '@/lib/api/admin-stores';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { useOnline } from '@/lib/use-online';
import { tid } from '@/lib/testid';

const T = (id: string) => tid('loja', id);
type Reason = ReturnType<typeof reasonPayload>;

interface FrameProps {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Valida os campos próprios do diálogo; devolve o erro ou `null`. */
  precheck?: () => string | null;
  children?: ReactNode;
  /** Envia com o motivo. Lança `ApiError` em falha. */
  onSubmit: (reason: Reason) => Promise<void>;
  /** "Recarregar" depois de um conflito de versão: busca a versão atual da loja. */
  onReload: () => Promise<unknown>;
  onClose: () => void;
  testId: string;
}

/** Erro da API por campo: `reason.code`, `reason.note`, `changes.name`... (RFC 9457 `errors[]`). */
function fieldErrors(error: ApiError) {
  return { code: error.fieldMessage('reason.code'), note: error.fieldMessage('reason.note') };
}

/**
 * Moldura de toda edição do admin sobre a loja (WB-351): motivo obrigatório (o da sessão vem preenchido e é confirmado a cada alteração),
 * versão otimista (409 vira "O lojista alterou a loja agora" com Recarregar; nada é sobrescrito), sem fila offline (dinheiro do lojista) e
 * falha fechada (se a auditoria não gravar, nada muda e o texto diz isso).
 */
function EditFrame({ title, description, confirmLabel, destructive, precheck, children, onSubmit, onReload, onClose, testId }: FrameProps) {
  const online = useOnline();
  const [reason, setReason] = useReasonState();
  const [errors, setErrors] = useState<{ code?: string | undefined; note?: string | undefined }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);

  async function confirm() {
    setMessage(null);
    const invalid = validateReason(reason);
    setErrors(invalid ? { [invalid.field]: invalid.message } : {});
    const own = precheck?.() ?? null;
    if (invalid || own) {
      setMessage(own);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(reasonPayload(reason));
      saveSessionReason(reason);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409 && caught.code === 'STORE_VERSION_CONFLICT') {
        setConflict(true);
      } else if (caught instanceof ApiError && caught.status === 422) {
        const fields = fieldErrors(caught);
        setErrors(fields);
        setMessage(fields.code || fields.note ? null : (caught.fields[0]?.message ?? 'Confira os campos.'));
      } else {
        setMessage(saveErrorMessage(caught));
      }
      setBusy(false);
    }
  }

  async function reload() {
    setReloading(true);
    try {
      await onReload();
      setConflict(false);
      setMessage('Recarregamos a loja. Confira e salve de novo.');
    } catch {
      setMessage('Não conseguimos recarregar agora. Nada foi alterado.');
    } finally {
      setReloading(false);
    }
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      locked={busy}
      testId={`${testId}-dialog`}
      actions={
        <>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={() => void confirm()} loading={busy} loadingLabel="Salvando…" disabled={!online || conflict} data-testid={`${testId}-confirm`}>
            {confirmLabel}
          </Button>
          <Button variant="text" onClick={onClose} disabled={busy} data-testid={`${testId}-cancel`}>
            Cancelar
          </Button>
        </>
      }
    >
      {description ? <div className="wb-text-body">{description}</div> : null}
      {!online ? <Banner tone="warning" offline>Conecte-se para editar. Nada foi alterado.</Banner> : null}
      {conflict ? (
        <Banner tone="danger" testId={T('conflict')} action={<Button variant="secondary" size="sm" onClick={() => void reload()} loading={reloading} loadingLabel="Recarregando…" data-testid={T('conflict-reload')}>Recarregar</Button>}>
          O lojista alterou a loja agora. Nada foi sobrescrito. Recarregue para ver a versão atual.
        </Banner>
      ) : null}
      {children}
      <AdminReasonFields value={reason} onChange={(next: ReasonValue) => setReason(next)} errors={errors} />
      {message ? <Banner tone={message.startsWith('Recarregamos') ? 'info' : 'danger'} testId={T('edit-message')}>{message}</Banner> : null}
    </Dialog>
  );
}

interface CommonProps {
  storeId: string;
  version: number;
  onDone: (message: string) => Promise<void> | void;
  onReload: () => Promise<unknown>;
  onClose: () => void;
}

/** Dados que o admin pode corrigir (lista fechada, C-ADM-03): nome de exibição, descrição, telefone e WhatsApp. Sem CNPJ, razão social nem endereço. */
export function EditProfileDialog({ storeId, version, store, onDone, onReload, onClose }: CommonProps & { store: AdminStoreOverview['store'] }) {
  const [name, setName] = useState(store.name ?? '');
  const [description, setDescription] = useState(store.description ?? '');
  const [phone, setPhone] = useState(store.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(store.whatsapp ?? '');
  const changes = {
    ...(name.trim() !== (store.name ?? '') ? { name: name.trim() } : {}),
    ...(description.trim() !== (store.description ?? '') ? { description: description.trim() } : {}),
    ...(phone.trim() !== (store.phone ?? '') ? { phone: phone.trim() } : {}),
    ...(whatsapp.trim() !== (store.whatsapp ?? '') ? { whatsapp: whatsapp.trim() } : {}),
  };
  return (
    <EditFrame
      title="Editar dados da loja"
      description="O lojista é avisado da alteração. CNPJ, razão social, documentos e conta de recebimento não ficam aqui."
      confirmLabel="Salvar dados"
      precheck={() => (Object.keys(changes).length === 0 ? 'Nada mudou. Altere um campo para salvar.' : name.trim().length < 2 ? 'O nome tem de 2 a 80 caracteres.' : null)}
      onSubmit={async (reason) => {
        await adminStoresApi.editProfile(storeId, { reason, expectedVersion: version, changes });
        await onDone('Dados alterados. O lojista foi avisado.');
      }}
      onReload={onReload}
      onClose={onClose}
      testId="admin.loja.edit-profile"
    >
      <TextField label="Nome de exibição" value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} autoComplete="off" data-testid={T('edit-name')} />
      <TextArea label="Descrição" value={description} onChange={(event) => setDescription(event.target.value.slice(0, 300))} counter={{ value: description.length, max: 300 }} rows={3} data-testid={T('edit-description')} />
      <TextField label="Telefone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value.slice(0, 20))} autoComplete="off" data-testid={T('edit-phone')} />
      <TextField label="WhatsApp" inputMode="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value.slice(0, 20))} autoComplete="off" data-testid={T('edit-whatsapp')} />
    </EditFrame>
  );
}

const PAUSE_OPTIONS = [
  { value: '30m', label: '30 minutos', verb: 'Pausar por 30 minutos' },
  { value: '1h', label: '1 hora', verb: 'Pausar por 1 hora' },
  { value: '2h', label: '2 horas', verb: 'Pausar por 2 horas' },
  { value: 'until_resume', label: 'Até reabrir', verb: 'Pausar até reabrir' },
] as const;
type PauseKind = (typeof PAUSE_OPTIONS)[number]['value'];

/** Pausar a loja (WB-351 C1): duração e motivo; o botão repete verbo e duração. */
export function PauseDialog({ storeId, version, storeName, onDone, onReload, onClose }: CommonProps & { storeName: string }) {
  const [kind, setKind] = useState<PauseKind>('2h');
  const current = PAUSE_OPTIONS.find((option) => option.value === kind)!;
  return (
    <EditFrame
      title={`Pausar ${storeName}`}
      description="A loja fecha para novos pedidos. Pedidos em aberto seguem."
      confirmLabel={current.verb}
      onSubmit={async (reason) => {
        await adminStoresApi.pause(storeId, { reason, expectedVersion: version, kind });
        await onDone('Loja pausada. O lojista foi avisado no painel e por e-mail.');
      }}
      onReload={onReload}
      onClose={onClose}
      testId="admin.loja.pause"
    >
      <RadioCards legend="Duração" name="pause-kind" value={kind} onChange={setKind} options={PAUSE_OPTIONS.map((option) => ({ value: option.value, label: option.label, testId: T(`pause-${option.value}`) }))} />
    </EditFrame>
  );
}

/** Reabrir agora: encerra a pausa (do lojista ou do admin), com motivo. */
export function ResumeDialog({ storeId, version, storeName, onDone, onReload, onClose }: CommonProps & { storeName: string }) {
  return (
    <EditFrame
      title={`Reabrir ${storeName}`}
      description="A loja volta a receber pedidos agora, se estiver dentro do horário. O lojista é avisado."
      confirmLabel="Reabrir agora"
      onSubmit={async (reason) => {
        await adminStoresApi.resume(storeId, { reason, expectedVersion: version });
        await onDone('Loja reaberta. O lojista foi avisado.');
      }}
      onReload={onReload}
      onClose={onClose}
      testId="admin.loja.resume"
    />
  );
}
