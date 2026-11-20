'use client';

import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, Dialog, SelectField, Tabs, TextField, cx, ui, useToast } from '@/components/ui';
import { canOpenStoreDocuments } from '@/lib/admin-access';
import { adminStoresApi, storeKeys, type AdminStoreDetail } from '@/lib/api/admin-stores';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { ACCESS_REASON_FOR, CHECKLIST, DOCUMENT_NAME, EMPTY_CHECKS, REJECT_REASONS, allOk, buildCorrectionItems, checkedCount, maskDocument, maskEmail, maskPhone, problems, problemsWithoutNote, type CheckId, type Checks } from './catalog';
import { DocumentViewer } from './doc-viewer';
import s from './stores.module.css';

const T = (id: string) => tid('caso', id);
const storageKey = (storeId: string) => `webag.admin.checklist.${storeId}`;

/** As marcações ficam no aparelho (só "ok/problema" e o texto do admin, sem dado do lojista): offline, nada se perde. */
function readChecks(storeId: string): Checks {
  try {
    const saved = window.sessionStorage.getItem(storageKey(storeId));
    if (saved) return { ...EMPTY_CHECKS, ...(JSON.parse(saved) as Checks) };
  } catch {
    /* sem armazenamento: começa vazio */
  }
  return EMPTY_CHECKS;
}

function useChecks(storeId: string): [Checks, (next: Checks) => void] {
  // O caso só monta depois de a loja carregar no navegador, então ler o armazenamento aqui é seguro (sem hidratação).
  const [checks, setChecks] = useState<Checks>(() => readChecks(storeId));
  const update = useCallback(
    (next: Checks) => {
      setChecks(next);
      try {
        window.sessionStorage.setItem(storageKey(storeId), JSON.stringify(next));
      } catch {
        /* cheio ou bloqueado */
      }
    },
    [storeId],
  );
  return [checks, update];
}

function Reveal({ field, label, value, masked }: { field: string; label: string; value: string; masked: string }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <dt className={cx('wb-text-caption-strong', ui.muted)}>{label}</dt>
      <dd>
        <span className={ui.mono} data-testid={T(`value-${field}`)}>{shown ? value : masked}</span>
        <Button variant="text" size="sm" icon={shown ? <EyeSlash size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />} onClick={() => setShown((v) => !v)} aria-label={`${shown ? 'Ocultar' : 'Revelar'} ${label}`} aria-pressed={shown} data-testid={T(`reveal-${field}`)}>
          {shown ? 'Ocultar' : 'Revelar'}
        </Button>
      </dd>
    </>
  );
}

function StoreData({ detail }: { detail: AdminStoreDetail }) {
  const { store, owner } = detail;
  const address = store.address;
  const duplicate = detail.sameDocument.length > 0;
  return (
    <dl className={s.dataList} data-testid={T('data')}>
      <dt className={cx('wb-text-caption-strong', ui.muted)}>Loja</dt>
      <dd>{store.name}</dd>
      <Reveal field="document" label={store.documentType === 'cnpj' ? 'CNPJ' : 'CPF'} value={store.document} masked={maskDocument(store.document)} />
      {store.legalName ? (
        <>
          <dt className={cx('wb-text-caption-strong', ui.muted)}>Razão social</dt>
          <dd>{store.legalName}</dd>
        </>
      ) : null}
      <dt className={cx('wb-text-caption-strong', ui.muted)}>Endereço</dt>
      <dd>{address ? `${address.street ?? ''}, ${address.number ?? ''} ${address.complement ?? ''} - ${address.neighborhood ?? ''}, ${address.city ?? ''}/${address.state ?? ''}, CEP ${address.cep}` : 'Sem endereço'}</dd>
      <Reveal field="whatsapp" label="WhatsApp" value={store.whatsapp ?? store.phone ?? ''} masked={maskPhone(store.whatsapp ?? store.phone)} />
      <dt className={cx('wb-text-caption-strong', ui.muted)}>Responsável</dt>
      <dd>{owner.name}</dd>
      <Reveal field="email" label="E-mail" value={owner.email} masked={maskEmail(owner.email)} />
      <dt className={cx('wb-text-caption-strong', ui.muted)}>Duplicidade</dt>
      <dd data-testid={T('duplicate')}>{duplicate ? <Badge tone="warning">Outra loja com o mesmo documento</Badge> : 'Não'}</dd>
      {detail.paymentAccount && !detail.paymentAccount.holderMatchesStore ? (
        <>
          <dt className={cx('wb-text-caption-strong', ui.muted)}>Conta de recebimento</dt>
          <dd>
            <Badge tone="warning">Titular diferente do cadastro</Badge>
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function Checklist({ checks, onChange, documents, pendingDocs }: { checks: Checks; onChange: (next: Checks) => void; documents: AdminStoreDetail['documents']; /** Documentos ainda não abertos pelo revisor (0 = pode conferir em bloco). */ pendingDocs: number }) {
  const set = (id: CheckId, patch: Partial<Checks[CheckId]>) => onChange({ ...checks, [id]: { ...checks[id], ...patch } });
  const done = checkedCount(checks);
  return (
    <section aria-labelledby="checklist-title" data-testid={T('checklist')}>
      <div className={ui.row} style={{ justifyContent: 'space-between' }}>
        <h3 id="checklist-title" className="wb-text-title2" style={{ margin: 0 }}>Checklist</h3>
        <Button variant="text" size="sm" onClick={() => onChange(Object.fromEntries(CHECKLIST.map((item) => [item.id, { ...checks[item.id], value: 'ok' as const, note: '' }])) as Checks)} disabled={allOk(checks) || pendingDocs > 0} aria-describedby={pendingDocs > 0 ? 'check-all-help' : undefined} data-testid={T('check-all')}>
          Conferir tudo
        </Button>
      </div>
      {pendingDocs > 0 ? (
        <p id="check-all-help" className={cx('wb-text-caption', ui.muted)} style={{ margin: '4px 0 0' }} data-testid={T('check-all-help')}>
          {pendingDocs === 1 ? 'Abra o documento que falta para conferir tudo de uma vez.' : `Abra os ${pendingDocs} documentos que faltam para conferir tudo de uma vez.`}
        </p>
      ) : null}
      <p className={cx('wb-text-caption', ui.muted)} style={{ margin: '4px 0 0' }} aria-live="polite">
        {allOk(checks) ? 'Checklist completa. Aprovar liberado.' : `Conferido ${checks ? CHECKLIST.filter((i) => checks[i.id].value === 'ok').length : 0} de ${CHECKLIST.length}`}
        {done > 0 && problems(checks).length > 0 ? ` · ${problems(checks).length} com problema` : ''}
      </p>
      {CHECKLIST.map((item) => {
        const state = checks[item.id];
        const name = `check-${item.id}`;
        return (
          <fieldset key={item.id} className={s.checkItem}>
            <legend className="wb-text-body-strong">{item.label}</legend>
            <div className={s.checkOptions}>
              <label className={cx(s.radioLabel, 'wb-text-body')}>
                <input type="radio" name={name} checked={state.value === 'ok'} onChange={() => set(item.id, { value: 'ok', note: '' })} data-testid={T(`check-${item.id}-ok`)} />
                Conferido
              </label>
              <label className={cx(s.radioLabel, 'wb-text-body')}>
                <input type="radio" name={name} checked={state.value === 'problem'} onChange={() => set(item.id, { value: 'problem' })} data-testid={T(`check-${item.id}-problem`)} />
                Problema
              </label>
            </div>
            {state.value === 'problem' ? (
              <>
                {item.target === 'document' && documents.length > 1 ? (
                  <SelectField label="Qual documento?" value={state.doc ?? documents.find((d) => d.current)?.kind ?? ''} onChange={(event) => set(item.id, { doc: event.target.value as never })}>
                    {documents.filter((d) => d.current).map((d) => (
                      <option key={d.id} value={d.kind}>{DOCUMENT_NAME[d.kind]}</option>
                    ))}
                  </SelectField>
                ) : null}
                <TextField label="O que está errado?" value={state.note} onChange={(event) => set(item.id, { note: event.target.value.slice(0, 300) })} hint="O lojista vai ler." autoComplete="off" data-testid={T(`check-${item.id}-note`)} />
              </>
            ) : null}
          </fieldset>
        );
      })}
    </section>
  );
}

type Dialogs = null | 'approve' | 'correction' | 'reject' | 'shortcuts';

/** A2: documento ao lado dos dados e da checklist; a decisão é registrada na auditoria pela API. */
export function ApprovalCase({ detail }: { detail: AdminStoreDetail }) {
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const online = useOnline();
  const { user } = useSession();
  const storeId = detail.store.id;
  const name = detail.store.name ?? 'a loja';
  const decide = user.adminProfile === 'super_admin' || user.adminProfile === 'operations';
  const canDocuments = canOpenStoreDocuments(user.adminProfile);
  const [checks, setChecks] = useChecks(storeId);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [confirmedEmpty, setConfirmedEmpty] = useState(false);
  const [mobileTab, setMobileTab] = useState<'documents' | 'data' | 'decision'>(canDocuments ? 'documents' : 'data');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [openedDocs, setOpenedDocs] = useState<ReadonlySet<string>>(new Set());
  const markOpened = useCallback((id: string) => setOpenedDocs((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);
  const current = useMemo(() => detail.documents.filter((doc) => doc.current), [detail.documents]);
  // Só segura a conferência em bloco quem pode abrir documentos; sem a permissão, o revisor marca item a item como antes.
  const pendingDocs = canDocuments ? current.filter((doc) => !openedDocs.has(doc.id)).length : 0;
  const complete = allOk(checks);
  const conferred = CHECKLIST.filter((item) => checks[item.id].value === 'ok').length;

  // Atalhos (a, j, k, ?): cada um tem botão equivalente. Ignorados enquanto se digita.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (dialog || event.metaKey || event.ctrlKey || event.altKey || (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === '?') setDialog('shortcuts');
      else if (event.key === 'a' && decide && complete) setDialog('approve');
      else if (event.key === 'j' || event.key === 'k') {
        const index = current.findIndex((doc) => doc.id === (selectedDoc ?? current[0]?.id));
        const next = current[index + (event.key === 'j' ? 1 : -1)];
        if (next) setSelectedDoc(next.id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, decide, complete, current, selectedDoc]);

  async function afterDecision(message: string) {
    await client.invalidateQueries({ queryKey: storeKeys.all });
    try {
      window.sessionStorage.removeItem(storageKey(storeId));
    } catch {
      /* ignora */
    }
    // Abre o próximo caso da fila (a mais antiga que sobrou).
    const next = await adminStoresApi.queue('in_review').then((page) => page.data.find((row) => row.id !== storeId)).catch(() => undefined);
    toast.show(next ? `${message} Próxima loja da fila.` : message);
    router.push(asRoute(next ? `/admin/lojas/${next.id}` : '/admin/lojas'));
  }

  /** Decisão: se outro admin decidiu antes, abre o diálogo de conflito em vez de mostrar erro genérico. */
  async function run(action: () => Promise<unknown>, message: string) {
    if (!online) throw new ApiError({ status: 0, code: 'NETWORK', title: 'Sem conexão' });
    try {
      await action();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'STORE_ALREADY_DECIDED') {
        setConflict(caught.detail ?? 'Esta loja já foi decidida.');
        setDialog(null);
        return;
      }
      throw caught;
    }
    await afterDecision(message);
  }

  const correctionItems = buildCorrectionItems(checks, detail.documents);
  const hasProblems = problems(checks).length > 0;

  const data = (
    <div className={ui.stack}>
      <h3 className="wb-text-title2" style={{ margin: 0 }}>Dados da loja</h3>
      <StoreData detail={detail} />
    </div>
  );
  const decision = (
    <div className={ui.stack}>
      {decide ? (
        <>
          <Checklist checks={checks} onChange={setChecks} documents={detail.documents} pendingDocs={pendingDocs} />
          <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Comissão: padrão da plataforma.</p>
          <p className="wb-text-body" style={{ margin: 0 }} aria-live="polite">
            Conferido {conferred} de {CHECKLIST.length}
          </p>
          {!online ? <Banner tone="warning" offline>Conecte-se para decidir. Suas marcações estão salvas.</Banner> : null}
          <Button size="lg" onClick={() => setDialog('approve')} disabled={!complete || !online} aria-describedby="approve-help" data-testid={T('approve')}>
            Aprovar loja
          </Button>
          {!complete ? <p id="approve-help" className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Confira os 6 itens para aprovar.</p> : null}
          <Button variant="secondary" onClick={() => setDialog('correction')} disabled={!hasProblems || !online} data-testid={T('request-correction')}>
            Pedir correção
          </Button>
          <Button variant="text" onClick={() => setDialog('reject')} disabled={!online} data-testid={T('reject')}>
            <span style={{ color: 'var(--wb-color-text-danger)' }}>Recusar loja</span>
          </Button>
          <Button variant="text" size="sm" onClick={() => setDialog('shortcuts')} data-testid={T('shortcuts')}>
            Atalhos do teclado
          </Button>
        </>
      ) : (
        <Banner tone="info" testId={T('read-only')}>Você pode ver este caso, mas não decidir.</Banner>
      )}
    </div>
  );
  const viewer = canDocuments ? <DocumentViewer storeId={storeId} documents={current} reason={ACCESS_REASON_FOR.in_review} selectedId={selectedDoc} onSelect={setSelectedDoc} onOpened={markOpened} /> : null;

  return (
    <div className={ui.stack}>
      <PageHeader title={detail.store.name ?? 'Loja'} description={`${detail.store.address?.city ?? ''} · enviada para análise`} action={<Badge tone="info" testId={T('status-badge')}>Em análise</Badge>} />
      <div className={s.mobileTabs}>
        <Tabs
          label="Partes do caso"
          value={mobileTab}
          onChange={setMobileTab}
          tabs={[...(canDocuments ? [{ id: 'documents' as const, label: 'Documentos' }] : []), { id: 'data' as const, label: 'Dados' }, ...(decide ? [{ id: 'decision' as const, label: 'Decisão' }] : [])]}
        />
      </div>
      <div className={s.caseGrid} data-tab={mobileTab}>
        {canDocuments ? <div className={s.paneDocs}>{viewer}</div> : null}
        <div className={cx(s.side, ui.card)}>
          <div className={s.paneData}>{data}</div>
          <div className={s.paneDecision}>{decision}</div>
        </div>
      </div>
      <div className={s.stickyBar}>
        <span className="wb-text-body-strong" aria-live="polite">Conferido {conferred} de {CHECKLIST.length}</span>
        {decide ? <Button onClick={() => setMobileTab('decision')}>Decisão</Button> : null}
      </div>

      {dialog === 'approve' ? (
        <Dialog
          title={`Aprovar ${name}?`}
          onClose={() => setDialog(null)}
          testId={T('approve-dialog')}
          actions={
            <>
              <ConfirmButton label="Aprovar loja" onConfirm={() => run(() => adminStoresApi.approve(storeId), `${name} aprovada.`)} onClose={() => setDialog(null)} testId={T('confirm-approve')} />
              <Button variant="text" onClick={() => setDialog(null)}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>O lojista é avisado por e-mail. A loja só aparece para clientes com 1 produto ativo e conta de recebimento conectada.</p>
        </Dialog>
      ) : null}
      {dialog === 'correction' ? (
        <Dialog
          title={`Pedir correção para ${name}?`}
          onClose={() => setDialog(null)}
          testId={T('correction-dialog')}
          actions={
            <>
              <ConfirmButton
                label="Pedir correção"
                precheck={() => {
                  const empty = problemsWithoutNote(checks).length > 0;
                  setConfirmedEmpty(empty);
                  return empty ? 'Escreva o que está errado em cada item com problema.' : null;
                }}
                onConfirm={() => run(() => adminStoresApi.requestCorrection(storeId, correctionItems), 'Correção pedida.')}
                onClose={() => setDialog(null)}
                testId={T('confirm-correction')}
              />
              <Button variant="text" onClick={() => setDialog(null)}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>O lojista recebe estes itens por e-mail. Edite o texto se precisar:</p>
          {problems(checks).map((item) => (
            <TextField
              key={item.id}
              label={item.label}
              value={checks[item.id].note}
              onChange={(event) => setChecks({ ...checks, [item.id]: { ...checks[item.id], note: event.target.value.slice(0, 300) } })}
              hint="O lojista vai ler."
              error={confirmedEmpty && checks[item.id].note.trim().length < 3 ? 'Escreva o que está errado.' : undefined}
              autoComplete="off"
              data-testid={T(`correction-note-${item.id}`)}
            />
          ))}
        </Dialog>
      ) : null}
      {dialog === 'reject' ? (
        <ReasonDialog
          title={`Recusar ${name}?`}
          description="O lojista lê o motivo no painel e por e-mail."
          quickReasons={[...REJECT_REASONS]}
          confirmLabel="Recusar loja"
          destructive
          minReason={5}
          onConfirm={(reason) => run(() => adminStoresApi.reject(storeId, reason), `${name} recusada.`)}
          onClose={() => setDialog(null)}
          testIds={{ dialog: T('reject-dialog'), reason: T('reject-reason'), confirm: T('confirm-reject') }}
        />
      ) : null}
      {dialog === 'shortcuts' ? (
        <Dialog title="Atalhos do teclado" onClose={() => setDialog(null)} testId={T('shortcuts-dialog')} actions={<Button onClick={() => setDialog(null)}>Fechar</Button>}>
          <dl className={s.dataList}>
            <dt><kbd>a</kbd></dt><dd>Aprovar (só com os 6 itens conferidos)</dd>
            <dt><kbd>j</kbd> e <kbd>k</kbd></dt><dd>Próximo e documento anterior</dd>
            <dt><kbd>+</kbd> e <kbd>-</kbd></dt><dd>Zoom no documento</dd>
            <dt><kbd>r</kbd></dt><dd>Girar o documento</dd>
          </dl>
        </Dialog>
      ) : null}
      {conflict ? (
        <Dialog
          title="Esta loja já foi decidida"
          onClose={() => setConflict(null)}
          testId={T('conflict-dialog')}
          actions={
            <>
              <Button
                onClick={() => {
                  setConflict(null);
                  void client.invalidateQueries({ queryKey: storeKeys.detail(storeId) });
                }}
                data-testid={T('conflict-see')}
              >
                Ver decisão
              </Button>
              <Button variant="text" onClick={() => router.push(asRoute('/admin/lojas'))} data-testid={T('conflict-back')}>
                Voltar à fila
              </Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>{conflict}</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function ConfirmButton({ label, onConfirm, onClose, precheck, testId }: { label: string; onConfirm: () => Promise<unknown>; onClose: () => void; precheck?: () => string | null; testId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function click() {
    const pre = precheck?.() ?? null;
    if (pre) return setError(pre);
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(saveErrorMessage(caught, 'Não foi possível salvar. Sua decisão não foi perdida.'));
      setBusy(false);
    }
  }
  return (
    <>
      <Button onClick={() => void click()} loading={busy} loadingLabel="Salvando…" data-testid={testId}>
        {label}
      </Button>
      {error ? <span role="alert" className="wb-text-caption" style={{ color: 'var(--wb-color-text-danger)' }} data-testid="decision-error">{error}</span> : null}
    </>
  );
}
