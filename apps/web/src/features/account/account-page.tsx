'use client';

import { DownloadSimple, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNow } from '@/lib/use-now';
import { PageHeader } from '@/components/panel/page-header';
import { Badge, Banner, Button, Dialog, PasswordField, QueryBoundary, SkeletonRows, cx, ui, useToast } from '@/components/ui';
import { BLOCKER_LABEL, accountApi, accountKeys, type AccountDeletionOverview, type DataExportStatus, type DeleteAccountResult } from '@/lib/api/account';
import type { Area } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatDateTime } from '@/lib/format';
import { ltid, tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { DELETED_COPY, DELETE_COPY, EXPORT_COPY, deletionEffects } from './legal-copy';

const tidOf = (area: Area) => (area === 'admin' ? (id: string) => tid('conta', id) : (id: string) => ltid('conta', id));

/** Texto de erro das ações da conta, por `code` estável da API. */
export function accountError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.isNetwork) return 'Conecte-se para continuar. Nada foi alterado.';
    switch (caught.code) {
      case 'INVALID_PASSWORD':
        return 'Senha incorreta.';
      case 'EMAIL_VERIFICATION_REQUIRED':
        return 'Confirme o seu e-mail antes de pedir a exportação.';
      case 'EXPORT_IN_PROGRESS':
        return 'Já existe uma exportação em andamento. Avisamos por e-mail quando ficar pronta.';
      case 'EXPORT_DAILY_LIMIT':
        return 'Você já pediu uma exportação hoje. Tente de novo amanhã.';
      case 'EXPORT_NOT_AVAILABLE':
        return 'O arquivo não está mais disponível. Peça uma nova exportação.';
      case 'DELETION_BLOCKED':
        return 'Ainda há pedido, troca ou estorno em aberto. Conclua antes de excluir.';
      case 'PASSWORD_NOT_SET':
        return DELETE_COPY.noPassword;
      case 'ADMIN_ACCOUNT_NOT_DELETABLE':
        return DELETE_COPY.adminNotDeletable;
      default:
        if (caught.status === 429) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    }
  }
  return saveErrorMessage(caught, 'Não foi possível concluir. Nada foi alterado. Tente de novo.');
}

/** Só segue um link de download http(s): o link vem da API, mas o navegador nunca abre outro esquema. */
export function safeDownloadUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Tela "Minha conta" do lojista (`/lojista/conta`). */
export function MerchantAccountPage() {
  return (
    <div className={ui.stack}>
      <PageHeader title="Minha conta" description="Seus dados e a exclusão da conta." />
      <DataExportCard area="lojista" />
      <DeleteAccountCard area="lojista" />
    </div>
  );
}

// ---- Exportar dados -------------------------------------------------------------------------------------------------------------

const EXPORT_STATUS: Record<DataExportStatus['status'], { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' }> = {
  queued: { label: 'Na fila', tone: 'info' },
  processing: { label: 'Preparando', tone: 'info' },
  ready: { label: 'Pronta para baixar', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  expired: { label: 'Vencida', tone: 'neutral' },
};

export function DataExportCard({ area }: { area: Area }) {
  const T = tidOf(area);
  const online = useOnline();
  const toast = useToast();
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  const now = useNow(30_000);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: accountKeys.export(area),
    queryFn: () => accountApi.exportStatus(area),
    refetchInterval: (q) => (q.state.data?.latest?.status === 'queued' || q.state.data?.latest?.status === 'processing' ? 15_000 : false),
  });
  const download = useMutation({
    mutationFn: (id: string) => accountApi.downloadLink(area, id),
    onSuccess: (result) => {
      const safe = safeDownloadUrl(result.url);
      if (!safe) return setLinkError('Não foi possível gerar um link seguro. Tente de novo.');
      setLinkError(null);
      setLink({ url: safe, expiresAt: result.expiresAt });
    },
    onError: (caught) => setLinkError(accountError(caught)),
  });

  return (
    <section className={cx(ui.card, ui.stack)} aria-labelledby={`export-${area}`} data-testid={T('export')}>
      <h2 id={`export-${area}`} className="wb-text-title2" style={{ margin: 0 }}>{EXPORT_COPY.title}</h2>
      <p className="wb-text-body" style={{ margin: 0 }}>{EXPORT_COPY.intro}</p>
      <p className="wb-text-caption" style={{ margin: 0 }}>{EXPORT_COPY.how}</p>
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={1} height={72} label="Carregando a exportação" />}>
        {(data) => {
          const latest = data.latest;
          const waitUntil = data.nextRequestAt && Date.parse(data.nextRequestAt) > now ? data.nextRequestAt : null;
          const pending = latest?.status === 'queued' || latest?.status === 'processing';
          return (
            <>
              {latest ? (
                <div className={ui.stack} data-testid={T('export-status')}>
                  <p className="wb-text-body" style={{ margin: 0 }}>
                    Último pedido: {formatDateTime(latest.requestedAt)} <Badge tone={EXPORT_STATUS[latest.status].tone}>{EXPORT_STATUS[latest.status].label}</Badge>
                  </p>
                  {pending ? <p className="wb-text-caption" style={{ margin: 0 }} role="status">Estamos preparando o arquivo. Pode fechar esta tela: avisamos por e-mail.</p> : null}
                  {latest.status === 'ready' ? (
                    <div className={ui.stack}>
                      <p className="wb-text-caption" style={{ margin: 0 }}>{latest.expiresAt ? `O arquivo fica disponível até ${formatDateTime(latest.expiresAt)}.` : null}</p>
                      {link ? (
                        <>
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="wb-text-body-strong" data-testid={T('export-download')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48 }}>
                            <DownloadSimple size={24} aria-hidden="true" />
                            Baixar o arquivo agora
                          </a>
                          <p className="wb-text-caption" style={{ margin: 0 }}>O link funciona uma vez e vence às {formatDateTime(link.expiresAt)}.</p>
                        </>
                      ) : (
                        <div>
                          <Button variant="secondary" icon={<DownloadSimple size={24} aria-hidden="true" />} onClick={() => download.mutate(latest.id)} loading={download.isPending} loadingLabel="Gerando o link…" disabled={!online} data-testid={T('export-link')}>Gerar link para baixar</Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {latest.status === 'failed' ? <Banner tone="danger">Não conseguimos montar o arquivo. Peça de novo.</Banner> : null}
                  {latest.status === 'expired' ? <p className="wb-text-caption" style={{ margin: 0 }}>O arquivo venceu. Peça uma nova exportação.</p> : null}
                </div>
              ) : (
                <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('export-never')}>Você ainda não pediu uma exportação.</p>
              )}
              {linkError ? <Banner tone="danger" testId={T('export-link-error')}>{linkError}</Banner> : null}
              {waitUntil ? <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('export-wait')}>Você pode pedir outra exportação a partir de {formatDateTime(waitUntil)}.</p> : null}
              <div>
                <Button onClick={() => setAsking(true)} disabled={!online || pending || waitUntil !== null} data-testid={T('export-open')}>Pedir exportação dos meus dados</Button>
              </div>
            </>
          );
        }}
      </QueryBoundary>
      {!online ? <Banner tone="warning" offline>Conecte-se para pedir a exportação.</Banner> : null}
      {asking ? (
        <PasswordDialog
          title="Pedir exportação dos meus dados"
          description={EXPORT_COPY.passwordWhy}
          confirmLabel="Pedir exportação"
          testIds={{ dialog: T('export-dialog'), input: T('export-password'), confirm: T('export-confirm'), error: T('export-error') }}
          onConfirm={async (password) => {
            await accountApi.requestExport(area, password);
            await client.invalidateQueries({ queryKey: accountKeys.export(area) });
            setLink(null);
            toast.show('Pedido enviado. Avisamos por e-mail quando estiver pronto.');
          }}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </section>
  );
}

// ---- Excluir conta --------------------------------------------------------------------------------------------------------------

export function DeleteAccountCard({ area }: { area: Area }) {
  const T = tidOf(area);
  const online = useOnline();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<DeleteAccountResult | null>(null);
  const query = useQuery({ queryKey: accountKeys.deletion(area), queryFn: () => accountApi.deletion(area), enabled: area !== 'admin' });

  if (done) return <DeletedState area={area} result={done} />;
  return (
    <section className={cx(ui.card, ui.stack)} aria-labelledby={`delete-${area}`} data-testid={T('delete')}>
      <h2 id={`delete-${area}`} className="wb-text-title2" style={{ margin: 0 }}>{DELETE_COPY.title}</h2>
      <p className="wb-text-body" style={{ margin: 0 }}>{DELETE_COPY.intro}</p>
      {area === 'admin' ? (
        <Banner tone="info" testId={T('delete-not-allowed')}>{DELETE_COPY.adminNotDeletable}</Banner>
      ) : (
        <QueryBoundary query={query} skeleton={<SkeletonRows rows={2} height={56} label="Carregando as regras da exclusão" />}>
          {(overview) => <DeleteBody area={area} overview={overview} online={online} onStart={() => setConfirming(true)} />}
        </QueryBoundary>
      )}
      {confirming && query.data ? (
        <PasswordDialog
          title={DELETE_COPY.confirmTitle}
          description={
            <>
              <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
                {deletionEffects(query.data).map((line) => (
                  <li key={line} className="wb-text-body">{line}</li>
                ))}
              </ul>
              <p className="wb-text-body" style={{ margin: 0 }}>{DELETE_COPY.passwordWhy}</p>
            </>
          }
          confirmLabel="Excluir minha conta"
          destructive
          testIds={{ dialog: T('delete-dialog'), input: T('delete-password'), confirm: T('delete-confirm'), error: T('delete-error') }}
          onConfirm={async (password) => {
            try {
              setDone(await accountApi.deleteAccount(area, password));
            } catch (caught) {
              if (caught instanceof ApiError && caught.code === 'DELETION_BLOCKED') void client.invalidateQueries({ queryKey: accountKeys.deletion(area) });
              throw caught;
            }
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </section>
  );
}

function DeleteBody({ area, overview, online, onStart }: { area: Area; overview: AccountDeletionOverview; online: boolean; onStart: () => void }) {
  const T = tidOf(area);
  if (overview.blockers.length > 0) {
    return (
      <div className={ui.stack} data-testid={T('delete-blocked')}>
        <Banner tone="warning"><strong>{DELETE_COPY.blockedTitle}.</strong> {DELETE_COPY.blockedText}</Banner>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {overview.blockers.map((blocker) => (
            <li key={`${blocker.kind}-${blocker.id}`} className="wb-text-body">{BLOCKER_LABEL[blocker.kind]}{blocker.number ? ` #${blocker.number}` : ''} · {blocker.status}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className={ui.stack}>
      <h3 className="wb-text-body-strong" style={{ margin: 0 }}>O que acontece</h3>
      <ul style={{ margin: 0, paddingLeft: 20 }} data-testid={T('delete-effects')}>
        {deletionEffects(overview).map((line) => (
          <li key={line} className="wb-text-body">{line}</li>
        ))}
      </ul>
      {!overview.hasPassword ? <Banner tone="info" testId={T('delete-no-password')}>{DELETE_COPY.noPassword}</Banner> : null}
      <div>
        <Button variant="destructive" icon={<Trash size={24} aria-hidden="true" />} onClick={onStart} disabled={!online || !overview.hasPassword || !overview.canDelete} data-testid={T('delete-open')}>Excluir minha conta</Button>
      </div>
      {!online ? <Banner tone="warning" offline>Conecte-se para excluir a conta.</Banner> : null}
    </div>
  );
}

function DeletedState({ area, result }: { area: Area; result: DeleteAccountResult }) {
  const T = tidOf(area);
  const pending = result.status === 'pending' && result.cancelableUntil;
  return (
    <section className={cx(ui.card, ui.stack)} role="status" data-testid={T('deleted')}>
      <h2 className="wb-text-title2" style={{ margin: 0 }}>{pending ? DELETED_COPY.pendingTitle : DELETED_COPY.completedTitle}</h2>
      {pending ? (
        <>
          <p className="wb-text-body" style={{ margin: 0 }}>Você pode desistir até {formatDateTime(result.cancelableUntil!)}. Para reativar, abra &quot;Desistir da exclusão&quot; na tela de entrada e informe o seu e-mail e a sua senha.</p>
          <a href={`/${area}/desistir-da-exclusao`} className="wb-text-body-strong" style={{ minHeight: 48, display: 'inline-flex', alignItems: 'center' }} data-testid={T('deleted-cancel-link')}>Desistir da exclusão</a>
        </>
      ) : (
        <p className="wb-text-body" style={{ margin: 0 }}>{DELETED_COPY.completedText}</p>
      )}
      <a href={`/${area}/entrar`} className="wb-text-body-strong" style={{ minHeight: 48, display: 'inline-flex', alignItems: 'center' }}>Ir para a tela de entrada</a>
    </section>
  );
}

// ---- Confirmação só com a senha -------------------------------------------------------------------------------------------------

function PasswordDialog({ title, description, confirmLabel, destructive, testIds, onConfirm, onClose }: { title: string; description: React.ReactNode; confirmLabel: string; destructive?: boolean; testIds: { dialog: string; input: string; confirm: string; error: string }; onConfirm: (password: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!password) return setFieldError('Digite a sua senha.');
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      await onConfirm(password);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'INVALID_PASSWORD') setFieldError('Senha incorreta.');
      else setError(accountError(caught));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      locked={busy}
      testId={testIds.dialog}
      actions={
        <>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={() => void submit()} loading={busy} loadingLabel="Enviando…" data-testid={testIds.confirm}>{confirmLabel}</Button>
          <Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button>
        </>
      }
    >
      <div className="wb-text-body">{description}</div>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
        <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" error={fieldError} testIds={{ input: testIds.input }} />
      </form>
      {error ? <Banner tone="danger" testId={testIds.error}>{error}</Banner> : null}
    </Dialog>
  );
}
