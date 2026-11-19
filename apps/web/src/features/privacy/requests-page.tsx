'use client';

import { Clock, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useReauth } from '@/components/panel/reauth';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, Dialog, EmptyState, NoAccessState, QueryBoundary, SelectField, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import k from '@/components/panel/kit.module.css';
import { CHANNEL_LABEL, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, deadlineText, privacyApi, privacyKeys, type PrivacyRequestItem, type PrivacyRequestType, type PrivacyRequestRevealed } from '@/lib/api/admin-privacy';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatDateTime, formatFullDateTime } from '@/lib/format';
import { tid } from '@/lib/testid';

const T = (id: string) => tid('titulares', id);
type Filter = 'all' | 'new' | 'overdue';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'Todas' }, { id: 'new', label: 'Novas' }, { id: 'overdue', label: 'Atrasadas' }];

function DeadlineBadge({ item, testId }: { item: Pick<PrivacyRequestItem, 'daysLeft' | 'overdue' | 'status'>; testId?: string }) {
  const late = item.status !== 'answered' && (item.overdue || item.daysLeft < 0);
  const today = item.status !== 'answered' && !late && item.daysLeft === 0;
  const Icon = late ? WarningCircle : Clock;
  return (
    <Badge tone={late ? 'danger' : today ? 'warning' : 'neutral'} icon={<Icon size={16} weight="fill" aria-hidden="true" />} testId={testId}>
      {deadlineText(item)}
    </Badge>
  );
}

/** OP3: pedidos de titulares. Responder a tempo (15 dias) e deixar registro. Só o super admin. */
export function PrivacyRequestsPage() {
  const { canView } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const query = useQuery({ queryKey: privacyKeys.list(filter), queryFn: () => privacyApi.list(filter === 'new' ? { status: 'new' } : filter === 'overdue' ? { overdue: true } : {}), enabled: canView('titulares') });
  if (!canView('titulares')) return <NoAccessState />;
  return (
    <div className={k.page}>
      <PageHeader title="Pedidos de titulares" description="Pedidos feitos em Privacidade e dados. O prazo para responder é de 15 dias." action={<Button onClick={() => setRegistering(true)} data-testid={T('new-request')}>Novo pedido</Button>} />
      <div className={k.actions} role="group" aria-label="Filtro">
        {FILTERS.map((f) => <button key={f.id} type="button" className={cx(ui.chip, 'wb-text-body')} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} data-testid={T(`chip-${f.id}`)}>{f.label}</button>)}
      </div>
      <div className={k.split}>
        <QueryBoundary query={query} skeletonLabel="Carregando pedidos" empty={(d) => (d.data.length === 0 ? <EmptyState icon={ShieldCheck} title="Nenhum pedido de titular" text="Pedidos feitos em Privacidade e dados aparecem aqui." testId={T('empty')} /> : null)}>
          {(data) => (
            <ul className={k.list} aria-label="Pedidos">
              {data.data.map((item) => (
                <li key={item.id}>
                  <button type="button" className={cx(k.card, 'wb-text-body')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', borderColor: selected === item.id ? 'var(--wb-color-action-primary)' : undefined }} aria-current={selected === item.id ? 'true' : undefined} onClick={() => setSelected(item.id)} data-testid={T(`row-${item.id}`)}>
                    <span className={k.row}><span className="wb-text-body-strong">{item.protocol}</span><DeadlineBadge item={item} testId={T(`deadline-${item.id}`)} /></span>
                    <span>{REQUEST_TYPE_LABEL[item.type]}</span>
                    <span className={cx('wb-text-caption', k.muted)}>{REQUEST_STATUS_LABEL[item.status]} · aberto em {formatDateTime(item.receivedAt)} · {item.requester}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
        {selected ? <Detail id={selected} onClose={() => setSelected(null)} /> : <p className={k.muted}>Escolha um pedido para ver o detalhe.</p>}
      </div>
      {registering ? <RegisterDialog onClose={() => setRegistering(false)} /> : null}
    </div>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const reauth = useReauth();
  const query = useQuery({ queryKey: privacyKeys.detail(id), queryFn: () => privacyApi.detail(id) });
  const [revealed, setRevealed] = useState<PrivacyRequestRevealed | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [answer, setAnswer] = useState('');
  const [answerTouched, setAnswerTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useMutation({ mutationFn: () => privacyApi.inProgress(id), onSuccess: () => client.invalidateQueries({ queryKey: privacyKeys.all }) });
  const send = useMutation({ mutationFn: () => privacyApi.answer(id, answer.trim()), onSuccess: () => client.invalidateQueries({ queryKey: privacyKeys.all }) });
  const invalid = answer.trim().length < 5 ? 'Escreva a resposta.' : undefined;

  return (
    <QueryBoundary query={query} skeletonLabel="Carregando pedido">
      {(d) => (
        <section className={cx(k.card, k.sticky)} aria-labelledby="det-title" data-testid={T('detail')}>
          <div className={k.row}>
            <h2 id="det-title" className="wb-text-title2" style={{ margin: 0 }}>{d.protocol}</h2>
            <Button variant="text" size="sm" onClick={onClose}>Fechar</Button>
          </div>
          <DeadlineBadge item={d} />
          <p className="wb-text-body" style={{ margin: 0 }}>{REQUEST_TYPE_LABEL[d.type]} · {CHANNEL_LABEL[d.channel]} · {REQUEST_STATUS_LABEL[d.status]}</p>
          <p className={k.muted}>Recebido em {formatFullDateTime(d.receivedAt)}. Prazo: {formatDateTime(d.dueAt)}.</p>
          <div className={k.card}>
            <span className="wb-text-label">Quem pediu</span>
            <span className="wb-text-body" data-testid={T('requester')}>{revealed ? revealed.email : d.requester}</span>
            {d.hasAccount ? <span className={cx('wb-text-caption', k.muted)}>Tem conta no Webag.</span> : null}
            <span className="wb-text-label">Mensagem</span>
            <p className={cx('wb-text-body', k.pre)} data-testid={T('message')}>{revealed ? (revealed.message ?? 'Sem mensagem.') : (d.messagePreview ?? 'Sem mensagem.')}</p>
            {!revealed ? <div><Button variant="secondary" size="sm" onClick={() => setRevealing(true)} data-testid={T('reveal')}>Revelar e-mail e mensagem</Button></div> : <p className="wb-text-caption" style={{ margin: 0 }}>Revelado agora. Ficou registrado na auditoria.</p>}
          </div>
          {d.status === 'answered' ? (
            <div className={k.card}><span className="wb-text-label">Resposta enviada</span><p className={cx('wb-text-body', k.pre)}>{d.answer}</p></div>
          ) : (
            <>
              {error ? <Banner tone="danger">{error}</Banner> : null}
              {d.status === 'new' ? <div><Button variant="secondary" loading={progress.isPending} loadingLabel="Salvando…" onClick={() => void progress.mutateAsync().then(() => toast.show('Marcado como em andamento.'), (e) => setError(saveErrorMessage(e)))} data-testid={T('in-progress')}>Marcar como em andamento</Button></div> : null}
              <TextArea label="Resposta ao titular" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value.slice(0, 1000))} counter={{ value: answer.length, max: 1000 }} error={answerTouched ? invalid : undefined} data-testid={T('answer-input')} />
              <Button onClick={() => { setAnswerTouched(true); if (!invalid) setConfirming(true); }} data-testid={T('send-answer')}>Registrar resposta e enviar e-mail</Button>
            </>
          )}
          <div>
            <h3 className="wb-text-body-strong" style={{ margin: '0 0 4px' }}>Histórico</h3>
            <ul className={k.list} data-testid={T('history')}>
              {d.history.map((h, i) => <li key={`${h.at}-${i}`} className="wb-text-caption">{formatDateTime(h.at)}: {{ opened: 'Pedido aberto', revealed: 'Dados revelados', in_progress: 'Marcado em andamento', answered: 'Resposta enviada' }[h.action]}{h.note ? ` (${h.note})` : ''}</li>)}
            </ul>
          </div>
          {revealing ? (
            <ReasonDialog
              title="Revelar os dados de quem pediu?"
              description="Fica registrado na auditoria, com o motivo. Use só para responder este pedido."
              minReason={10}
              maxReason={300}
              confirmLabel="Revelar dados"
              onConfirm={async (reason) => {
                const result = await reauth.guard(() => privacyApi.reveal(id, reason), 'Ver o e-mail de um titular exige confirmar a sua identidade.');
                setRevealed(result as PrivacyRequestRevealed);
                await client.invalidateQueries({ queryKey: privacyKeys.detail(id) });
              }}
              onClose={() => setRevealing(false)}
            />
          ) : null}
          {confirming ? (
            <Dialog
              title="Enviar a resposta?"
              onClose={() => setConfirming(false)}
              locked={send.isPending}
              testId={T('send-confirm-dialog')}
              actions={<><Button loading={send.isPending} loadingLabel="Enviando…" onClick={() => void send.mutateAsync().then(() => { toast.show('Resposta enviada. Pedido encerrado.'); setConfirming(false); setAnswer(''); }, (e) => { setError((e as { status?: number }).status === 409 ? 'Este pedido já foi respondido.' : saveErrorMessage(e)); setConfirming(false); })} data-testid={T('send-confirm')}>Enviar resposta</Button><Button variant="text" onClick={() => setConfirming(false)} disabled={send.isPending}>Cancelar</Button></>}
            >
              <p className="wb-text-body" style={{ margin: 0 }}>O titular recebe por e-mail e o pedido fecha.</p>
            </Dialog>
          ) : null}
        </section>
      )}
    </QueryBoundary>
  );
}

function RegisterDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<PrivacyRequestType>('access');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const next: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Confira o e-mail.';
    if (receivedAt && new Date(receivedAt).getTime() > Date.now()) next.receivedAt = 'A data não pode ser no futuro.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const receipt = await privacyApi.register({ type, email: email.trim(), ...(message.trim() ? { message: message.trim() } : {}), ...(receivedAt ? { receivedAt: new Date(receivedAt).toISOString() } : {}) });
      await client.invalidateQueries({ queryKey: privacyKeys.all });
      toast.show(`Pedido registrado. Protocolo ${receipt.protocol}.`);
      onClose();
    } catch (error) {
      setFormError(saveErrorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Registrar pedido recebido por e-mail" onClose={onClose} locked={busy} testId={T('register-dialog')} actions={<><Button loading={busy} loadingLabel="Salvando…" onClick={() => void save()} data-testid={T('register-submit')}>Registrar pedido</Button><Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button></>}>
      <div className={k.form}>
        {formError ? <Banner tone="danger">{formError}</Banner> : null}
        <SelectField label="Tipo" value={type} onChange={(e) => setType(e.target.value as PrivacyRequestType)} data-testid={T('register-type')}>{(Object.keys(REQUEST_TYPE_LABEL) as PrivacyRequestType[]).map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}</SelectField>
        <TextField label="E-mail de quem pediu" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} data-testid={T('register-email')} />
        <TextField label="Recebido em" type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} error={errors.receivedAt} hint="O prazo de 15 dias conta daqui. Vazio = agora." />
        <TextArea label="Texto do pedido" rows={4} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} counter={{ value: message.length, max: 1000 }} />
      </div>
    </Dialog>
  );
}
