'use client';

import { PaperPlaneTilt } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, Dialog, EmptyState, NoAccessState, QueryBoundary, SelectField, TabPanel, Tabs, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import k from '@/components/panel/kit.module.css';
import { adminApi, keys } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { marketingApi, marketingKeys, type PushCampaign, type PushCampaignCreate, type PushSegment } from '@/lib/api/admin-marketing';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatDateTime, fromLocalInput } from '@/lib/format';
import { tid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';

const T = (id: string) => tid('push', id);
type SegmentKind = PushSegment['kind'];
const SEGMENTS: { id: SegmentKind; label: string }[] = [
  { id: 'city', label: 'Cidade' },
  { id: 'neighborhood', label: 'Bairro' },
  { id: 'inactive', label: 'Sem comprar há N dias' },
  { id: 'bought_category', label: 'Comprou na categoria' },
  { id: 'new_customers', label: 'Novos clientes' },
];
const DEST_LABEL = { home: 'Início do app', store: 'Uma loja', category: 'Uma categoria', coupon: 'Um cupom' } as const;
type DestKind = keyof typeof DEST_LABEL;
const SEGMENT_LABEL: Record<SegmentKind, string> = { city: 'Cidade', neighborhood: 'Bairro', inactive: 'Sem comprar', bought_category: 'Comprou na categoria', new_customers: 'Novos clientes' };

export function PushPage() {
  const { canView } = useSession();
  const [tab, setTab] = useState<'new' | 'sent'>('new');
  if (!canView('push')) return <NoAccessState />;
  return (
    <div className={k.page}>
      <PageHeader title="Push segmentado" description="Envie ofertas só para quem aceitou receber. Ninguém é identificado." />
      <Tabs label="Push" value={tab} onChange={setTab} tabs={[{ id: 'new', label: 'Nova campanha', testId: T('tab-new') }, { id: 'sent', label: 'Enviadas', testId: T('tab-sent') }]} />
      <TabPanel id={tab}>{tab === 'new' ? <NewCampaign onSent={() => setTab('sent')} /> : <SentList onNew={() => setTab('new')} />}</TabPanel>
    </div>
  );
}

function NewCampaign({ onSent }: { onSent: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const cities = useQuery({ queryKey: keys.cities, queryFn: adminApi.cities });
  const categories = useQuery({ queryKey: keys.categories, queryFn: adminApi.categories });
  const [kind, setKind] = useState<SegmentKind>('city');
  const [cityId, setCityId] = useState('');
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [days, setDays] = useState('30');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [destKind, setDestKind] = useState<DestKind>('home');
  const [destValue, setDestValue] = useState('');
  const [later, setLater] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<{ key: string } | null>(null);

  const segment = useMemo<PushSegment | null>(() => {
    const n = Number(days);
    switch (kind) {
      case 'city': return cityId ? { kind, cityId } : null;
      case 'neighborhood': return neighborhoodId ? { kind, neighborhoodId } : null;
      case 'bought_category': return categoryId ? { kind, categoryId } : null;
      case 'inactive': return Number.isInteger(n) && n >= 7 && n <= 365 ? { kind, days: n } : null;
      case 'new_customers': return Number.isInteger(n) && n >= 1 && n <= 90 ? { kind, days: n } : null;
    }
  }, [kind, cityId, neighborhoodId, categoryId, days]);

  const estimate = useQuery({ queryKey: ['admin', 'push', 'estimate', segment], queryFn: () => marketingApi.pushEstimate(segment!), enabled: segment !== null, staleTime: 15_000 });
  const est = estimate.data;
  const blockedReason = !est ? null : !est.marketingEnabled ? 'Push desligado' : est.belowMinimum ? `Mínimo de ${est.minimum} pessoas` : null;

  const destination = useMemo<PushCampaignCreate['destination'] | null>(() => {
    if (destKind === 'home') return { type: 'home' };
    if (!destValue) return null;
    return destKind === 'coupon' ? { type: 'coupon', code: destValue } : { type: destKind, id: destValue };
  }, [destKind, destValue]);

  const neighborhoods = (cities.data?.data ?? []).flatMap((c) => c.neighborhoods.map((n) => ({ ...n, city: c.name })));
  const flatCategories = (categories.data?.data ?? []).flatMap((c) => [{ id: c.id, name: c.name }, ...c.children.map((x) => ({ id: x.id, name: `${c.name} / ${x.name}` }))]);

  const create = useMutation({
    mutationFn: (key: string) => {
      const at = later ? fromLocalInput(scheduleAt) : null;
      return marketingApi.createCampaign({ title: title.trim(), body: body.trim(), destination: destination!, segment: segment!, expectedRecipients: est!.eligible ?? 0, ...(at ? { scheduleAt: at } : {}) }, key);
    },
  });

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!segment) next.segment = 'Escolha quem recebe.';
    if (title.trim().length < 1) next.title = 'Escreva o título.';
    if (body.trim().length < 1) next.body = 'Escreva a mensagem.';
    if (!destination) next.destination = 'Escolha a tela que abre.';
    if (later) {
      const at = fromLocalInput(scheduleAt);
      if (!at || Date.parse(at) <= Date.now()) next.schedule = 'Escolha um horário no futuro.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function send() {
    if (!confirming) return;
    try {
      const sent = await create.mutateAsync(confirming.key);
      await client.invalidateQueries({ queryKey: marketingKeys.campaigns });
      toast.show(sent.status === 'scheduled' ? 'Push agendado.' : `Push enviado para ${est?.eligible ?? 0} pessoas.`);
      setConfirming(null);
      onSent();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ESTIMATE_CHANGED') {
        await estimate.refetch();
        throw new Error('O número de pessoas mudou. Confira a nova estimativa e envie de novo.');
      }
      if (error instanceof ApiError && error.code === 'SEGMENT_TOO_SMALL') throw new Error('Segmentos pequenos podem identificar alguém. Escolha um maior.');
      if (error instanceof ApiError && error.code === 'PUSH_MARKETING_DISABLED') throw new Error('O push de marketing está desligado. Nada foi enviado.');
      throw new Error(saveErrorMessage(error));
    }
  }

  const now = useNow(30_000);
  const sendLabel = est?.nextSendAt && !later && Date.parse(est.nextSendAt) - now > 60_000;

  return (
    <div className={k.split}>
      <form className={k.form} onSubmit={(e) => { e.preventDefault(); if (validate() && !blockedReason && est) setConfirming({ key: crypto.randomUUID() }); }} noValidate>
        {est && !est.marketingEnabled ? <Banner tone="warning" testId={T('flag-off-banner')}>O push de marketing está desligado. Nada será enviado.</Banner> : null}
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="wb-text-label">Quem recebe</legend>
          <div className={ui.row}>
            {SEGMENTS.map((s) => (
              <label key={s.id} className={cx(ui.chip, 'wb-text-body')} style={{ cursor: 'pointer' }}>
                <input type="radio" name="segment" className={ui.srOnly} checked={kind === s.id} onChange={() => setKind(s.id)} data-testid={T(`segment-${s.id}`)} />
                <span aria-hidden="true">{kind === s.id ? '● ' : '○ '}</span>{s.label}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === 'city' ? <SelectField label="Cidade" value={cityId} onChange={(e) => setCityId(e.target.value)} data-testid={T('segment-value')}><option value="">Escolha</option>{(cities.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField> : null}
        {kind === 'neighborhood' ? <SelectField label="Bairro" value={neighborhoodId} onChange={(e) => setNeighborhoodId(e.target.value)} data-testid={T('segment-value')}><option value="">Escolha</option>{neighborhoods.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.city})</option>)}</SelectField> : null}
        {kind === 'bought_category' ? <SelectField label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid={T('segment-value')}><option value="">Escolha</option>{flatCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField> : null}
        {kind === 'inactive' || kind === 'new_customers' ? <TextField label={kind === 'inactive' ? 'Dias sem comprar (7 a 365)' : 'Cadastrados nos últimos dias (1 a 90)'} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} data-testid={T('segment-value')} /> : null}
        {errors.segment ? <p role="alert" className="wb-text-caption" style={{ color: 'var(--wb-color-text-danger)', margin: 0 }}>{errors.segment}</p> : null}
        <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} counter={{ value: title.length, max: 60 }} error={errors.title} data-testid={T('title-input')} />
        <TextArea label="Mensagem" rows={3} value={body} onChange={(e) => setBody(e.target.value.slice(0, 120))} counter={{ value: body.length, max: 120 }} error={errors.body} data-testid={T('body-input')} />
        <SelectField label="Tela que abre" value={destKind} onChange={(e) => { setDestKind(e.target.value as DestKind); setDestValue(''); }} data-testid={T('destination')}>
          {(Object.keys(DEST_LABEL) as DestKind[]).map((d) => <option key={d} value={d}>{DEST_LABEL[d]}</option>)}
        </SelectField>
        {destKind === 'category' ? <SelectField label="Categoria" value={destValue} onChange={(e) => setDestValue(e.target.value)} error={errors.destination}><option value="">Escolha</option>{flatCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField> : null}
        {destKind === 'store' ? <TextField label="Identificador da loja" value={destValue} onChange={(e) => setDestValue(e.target.value.trim())} error={errors.destination} /> : null}
        {destKind === 'coupon' ? <TextField label="Código do cupom" value={destValue} onChange={(e) => setDestValue(e.target.value.toUpperCase().slice(0, 20))} error={errors.destination} /> : null}
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <legend className="wb-text-label">Quando</legend>
          <label className={cx(ui.chip, 'wb-text-body')}><input type="radio" name="when" className={ui.srOnly} checked={!later} onChange={() => setLater(false)} data-testid={T('schedule-now')} /><span aria-hidden="true">{!later ? '● ' : '○ '}</span>Agora</label>
          <label className={cx(ui.chip, 'wb-text-body')}><input type="radio" name="when" className={ui.srOnly} checked={later} onChange={() => setLater(true)} data-testid={T('schedule-later')} /><span aria-hidden="true">{later ? '● ' : '○ '}</span>Agendar</label>
        </fieldset>
        {later ? <TextField label="Enviar em" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} error={errors.schedule} hint="Fora das 9h às 20h, o envio vai para o próximo início da janela." /> : null}
        {sendLabel ? <Banner tone="info" testId={T('window-notice')}>Fora do horário de envio ({`entre 9h e 20h`}). Será enviado em {formatDateTime(est!.nextSendAt)}.</Banner> : null}
        <Button type="submit" size="lg" disabled={blockedReason !== null} data-testid={T('submit')}>{blockedReason ?? 'Enviar push'}</Button>
      </form>

      <aside className={cx(k.card, k.sticky)} aria-label="Quem recebe">
        <h2 className="wb-text-title2" style={{ margin: 0 }}>Quem recebe</h2>
        <div aria-live="polite" data-testid={T('estimate')}>
          {segment === null ? <p className={k.muted}>Escolha o segmento para ver a estimativa.</p> : estimate.isPending ? <p className={k.muted} role="status">Calculando…</p> : estimate.isError ? (
            <Banner tone="danger" action={<Button variant="secondary" size="sm" onClick={() => void estimate.refetch()}>Tentar de novo</Button>}>Não conseguimos calcular. O envio não libera sem estimativa.</Banner>
          ) : est ? (
            <>
              <p className={k.bigNumber}>{est.belowMinimum ? `Poucas pessoas` : `${est.eligible ?? 0} pessoas`}</p>
              <p className={cx('wb-text-caption', k.muted)}>só quem aceitou receber ofertas</p>
              {!est.belowMinimum && est.excludedByCap ? <p className="wb-text-caption" data-testid={T('excluded-note')}>{est.excludedByCap} ficam de fora: já receberam o máximo de avisos esta semana.</p> : null}
              {est.belowMinimum ? <p className="wb-text-caption" role="alert">Segmentos pequenos podem identificar alguém. Escolha um maior. Mínimo de {est.minimum} pessoas.</p> : null}
            </>
          ) : null}
        </div>
        <div className={k.phone} data-testid={T('preview')}>
          <span className="wb-text-caption">Webag</span>
          <span className="wb-text-body-strong">{title || 'Título do aviso'}</span>
          <span className="wb-text-body">{body || 'A mensagem aparece aqui.'}</span>
        </div>
      </aside>

      {confirming ? (
        <Dialog
          title={`Enviar para ${est?.eligible ?? 0} pessoas?`}
          onClose={() => setConfirming(null)}
          locked={create.isPending}
          testId={T('send-dialog')}
          actions={<SendActions onSend={send} onCancel={() => setConfirming(null)} pending={create.isPending} />}
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Não dá para desfazer depois do envio. Ele respeita a janela das 9h às 20h e o limite de avisos por semana.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function SendActions({ onSend, onCancel, pending }: { onSend: () => Promise<void>; onCancel: () => void; pending: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error ? <Banner tone="danger" testId={T('send-error')}>{error}</Banner> : null}
      <Button loading={pending} loadingLabel="Enviando…" onClick={() => void onSend().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Não foi possível enviar.'))} data-testid={T('send-confirm')}>Enviar push</Button>
      <Button variant="text" onClick={onCancel} disabled={pending}>Cancelar</Button>
    </>
  );
}

const STATUS_LABEL: Record<PushCampaign['status'], string> = { scheduled: 'Agendada', sending: 'Enviando', sent: 'Enviada', cancelled: 'Cancelada' };

function SentList({ onNew }: { onNew: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: marketingKeys.campaigns, queryFn: () => marketingApi.pushCampaigns() });
  const [cancelling, setCancelling] = useState<PushCampaign | null>(null);
  const rate = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '-');
  return (
    <>
    <QueryBoundary query={query} skeletonLabel="Carregando campanhas" empty={(d) => (d.data.length === 0 ? <EmptyState icon={PaperPlaneTilt} title="Nenhuma campanha ainda" text="Quando você enviar, os resultados aparecem aqui." actionLabel="Nova campanha" onAction={onNew} testId={T('sent-empty')} /> : null)}>
      {(data) => (
        <ul className={k.list}>
          {data.data.map((c) => (
            <li key={c.id} className={k.card} data-testid={T(`sent-row-${c.id}`)}>
              <div className={k.row}>
                <span className="wb-text-body-strong">{c.title}</span>
                <span className="wb-text-caption">{STATUS_LABEL[c.status]} · {formatDateTime(c.sentAt ?? c.sendAt)}</span>
              </div>
              <span className={cx('wb-text-caption', k.muted)}>{SEGMENT_LABEL[c.segment.kind]} · {c.body}</span>
              <span className={cx('wb-text-body', ui.mono)}>
                {c.sent} enviados · {c.delivered} entregues ({rate(c.delivered, c.sent)}) · {c.opened} abertos ({rate(c.opened, c.delivered)}) · {c.unsubscribed} descadastros
              </span>
              {c.status === 'cancelled' && c.cancelReason ? <span className="wb-text-caption">Motivo: {c.cancelReason}</span> : null}
              {c.status === 'scheduled' ? <div><Button variant="secondary" size="sm" onClick={() => setCancelling(c)} data-testid={T(`sent-row-${c.id}-cancel`)}>Cancelar envio</Button></div> : null}
            </li>
          ))}
        </ul>
      )}
    </QueryBoundary>
      {cancelling ? (
        <ReasonDialog
          title="Cancelar este envio?"
          description="Ninguém recebe. Só vale antes da hora marcada."
          minReason={3}
          confirmLabel="Cancelar envio"
          destructive
          onConfirm={async (reason) => {
            await marketingApi.cancelCampaign(cancelling.id, reason);
            await client.invalidateQueries({ queryKey: marketingKeys.campaigns });
            toast.show('Envio cancelado.');
          }}
          onClose={() => setCancelling(null)}
        />
      ) : null}
    </>
  );
}
