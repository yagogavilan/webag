'use client';

import { ShieldCheck, Warning } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, Dialog, EmptyState, NoAccessState, QueryBoundary, RadioCards, TabPanel, Tabs, TextField, cx, useToast } from '@/components/ui';
import k from '@/components/panel/kit.module.css';
import { REMOVE_REASONS, REPORT_REASON_LABEL, contentApi, contentKeys, type RemoveReasonCode, type ReportTarget } from '@/lib/api/admin-content';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatDateTime } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';
import Link from 'next/link';

const T = (id: string) => tid('denuncias', id);
const TAB_LABEL: Record<ReportTarget, string> = { review: 'Avaliações', product: 'Produtos', store: 'Lojas' };

/** DN2: tratar cada denúncia em até 2 dias úteis sem punir opinião. A ação principal é "Manter". */
export function ContentReportsPage() {
  const { canView, canEdit } = useSession();
  const [tab, setTab] = useState<ReportTarget>('review');
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useQuery({ queryKey: contentKeys.queue(tab), queryFn: () => contentApi.queue(tab), enabled: canView('denuncias') });
  if (!canView('denuncias')) return <NoAccessState />;
  return (
    <div className={k.page}>
      <PageHeader title="Denúncias" description="Avaliações, produtos e lojas denunciados. A meta é tratar em até 2 dias úteis." />
      <Tabs label="Tipo de denúncia" value={tab} onChange={(t) => { setTab(t); setSelected(null); }} tabs={(['review', 'product', 'store'] as const).map((t) => ({ id: t, label: TAB_LABEL[t], testId: T(`tab-${t === 'review' ? 'reviews' : t === 'product' ? 'products' : 'stores'}`) }))} />
      <TabPanel id={tab}>
        <div className={k.split}>
          <QueryBoundary query={queue} skeletonLabel="Carregando denúncias" empty={(d) => (d.data.length === 0 ? <EmptyState icon={ShieldCheck} title="Nenhuma denúncia para analisar" text="Denúncias de avaliações, produtos e lojas aparecem aqui." testId={T('empty')} /> : null)}>
            {(data) => (
              <ul className={k.list} data-testid={T('reports-list')}>
                {data.data.map((row) => (
                  <li key={row.targetId}>
                    <button type="button" className={cx(k.card, 'wb-text-body')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', borderColor: selected === row.targetId ? 'var(--wb-color-action-primary)' : undefined }} aria-current={selected === row.targetId ? 'true' : undefined} onClick={() => setSelected(row.targetId)} data-testid={T(`row-${row.targetId}`)}>
                      <span className={k.row}>
                        <span className="wb-text-body-strong">{row.title}</span>
                        {row.overdue ? <Badge tone="danger" icon={<Warning size={16} weight="fill" aria-hidden="true" />} testId={T('overdue-badge')}>Atrasado</Badge> : null}
                      </span>
                      {row.excerpt ? <span>{row.excerpt}</span> : null}
                      <span className={cx('wb-text-caption', k.muted)}>{row.reasons.map((r) => REPORT_REASON_LABEL[r] ?? r).join(', ')} · {row.reports} {row.reports === 1 ? 'denúncia' : 'denúncias'} · desde {formatDateTime(row.oldestAt)}{row.available ? '' : ' · item já removido'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
          {selected ? <Case type={tab} id={selected} editable={canEdit('denuncias')} onDone={() => setSelected(null)} /> : <p className={k.muted}>Escolha uma denúncia para ver o caso.</p>}
        </div>
      </TabPanel>
    </div>
  );
}

function Case({ type, id, editable, onDone }: { type: ReportTarget; id: string; editable: boolean; onDone: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: contentKeys.case(type, id), queryFn: () => contentApi.case(type, id) });
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = async (message: string) => {
    await client.invalidateQueries({ queryKey: contentKeys.all });
    toast.show(message);
    onDone();
  };
  async function keep() {
    setBusy(true);
    setError(null);
    try {
      await contentApi.keep(type, id);
      await done(type === 'review' ? 'Denúncia encerrada. O denunciante foi avisado.' : 'Denúncia encerrada.');
    } catch (e) {
      setError((e as { status?: number }).status === 409 ? 'Esta denúncia já foi tratada.' : saveErrorMessage(e));
      setBusy(false);
    }
  }
  async function forward() {
    setBusy(true);
    setError(null);
    try {
      await contentApi.forward(type as 'product' | 'store', id);
      await done('Encaminhada para a moderação.');
    } catch (e) {
      setError(saveErrorMessage(e));
      setBusy(false);
    }
  }
  return (
    <QueryBoundary query={query} skeletonLabel="Carregando o caso">
      {(c) => (
        <section className={cx(k.card, k.sticky)} aria-labelledby="case-title" data-testid={T('case')}>
          <h2 id="case-title" className="wb-text-title2" style={{ margin: 0 }}>{c.title}</h2>
          {c.excerpt ? <p className={cx('wb-text-body', k.pre)}>{c.excerpt}</p> : null}
          {!c.available ? <Banner tone="info">Este item já não está no ar.</Banner> : null}
          <h3 className="wb-text-body-strong" style={{ margin: 0 }}>Denúncias</h3>
          <ul className={k.list}>
            {c.reports.map((r, i) => (
              <li key={`${r.reportedAt}-${i}`} className="wb-text-body">
                {REPORT_REASON_LABEL[r.reason] ?? r.reason}{r.text ? `: ${r.text}` : ''}
                <span className={cx('wb-text-caption', k.muted)} style={{ display: 'block' }}>{r.reporter} · {formatDateTime(r.reportedAt)}{r.status !== 'open' ? ` · ${{ kept: 'mantida', removed: 'removida', forwarded: 'encaminhada', open: '' }[r.status]}` : ''}</span>
              </li>
            ))}
          </ul>
          {error ? <Banner tone="danger" testId={T('error')}>{error}</Banner> : null}
          {type === 'review' ? <p className="wb-text-caption" style={{ margin: 0 }}>Não removemos avaliação só por ser negativa.</p> : null}
          {editable ? (
            <div className={k.actions}>
              <Button loading={busy} loadingLabel="Salvando…" onClick={() => void keep()} data-testid={T('keep')}>{type === 'review' ? 'Manter avaliação' : 'Manter'}</Button>
              {type === 'review' ? <Button variant="secondary" disabled={busy} onClick={() => setRemoving(true)} data-testid={T('remove')}>Remover avaliação</Button> : <Button variant="secondary" disabled={busy} onClick={() => void forward()} data-testid={T('forward')}>Encaminhar</Button>}
              {type === 'product' ? <Link className="wb-text-body" href={asRoute('/admin/moderacao')}>Abrir a moderação de produtos</Link> : null}
            </div>
          ) : null}
          {removing ? <RemoveDialog onClose={() => setRemoving(false)} onConfirm={async (code, note) => { await contentApi.removeReview(id, code, note); await done('Avaliação removida. O autor foi avisado.'); }} /> : null}
        </section>
      )}
    </QueryBoundary>
  );
}

function RemoveDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (code: RemoveReasonCode, note?: string) => Promise<void> }) {
  const [code, setCode] = useState<RemoveReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!code) return setError('Escolha o motivo.');
    setBusy(true);
    setError(null);
    try {
      await onConfirm(code, note.trim() || undefined);
      onClose();
    } catch (e) {
      setError(saveErrorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Remover a avaliação?" onClose={onClose} locked={busy} testId={T('remove-dialog')} actions={<><Button variant="destructive" loading={busy} loadingLabel="Removendo…" onClick={() => void confirm()} data-testid={T('remove-confirm')}>Remover avaliação</Button><Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button></>}>
      <div className={k.form}>
        <p className="wb-text-body" style={{ margin: 0 }}>A nota deixa de contar e o autor é avisado. Avaliação negativa, por si só, não é motivo para remover.</p>
        <RadioCards legend="Motivo" name="remove-reason" value={code} onChange={setCode} options={REMOVE_REASONS.map((r) => ({ value: r.id, label: r.label, testId: T(`remove-reason-${r.id}`) }))} />
        <TextField label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 150))} counter={{ value: note.length, max: 150 }} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
      </div>
    </Dialog>
  );
}
