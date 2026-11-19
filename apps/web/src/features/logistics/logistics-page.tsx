'use client';

import { Motorcycle, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DeadlineBlock, Kpi, KpiRow, LimaAction, NightBlock, type DeadlineState } from '@/components/panel/blocks';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, EmptyState, ErrorState, NoAccessState, SkeletonRows, SolarIcon, Switch, Tabs, cx, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { KIND_LABEL, STATUS_LABEL, batchesOf, brasiliaToday, etaBandText, etaLevel, etaLevelText, lateAlertsSince, logisticsApi, logisticsKeys, pendingLateCancel, sortQueueByEta, waitLevel, waitText, type AreaBatch, type Delivery, type DeliveryKind } from '@/lib/api/logistics';
import { formatCents } from '@/lib/format';
import { createAlertSound } from '@/lib/orders/alert-sound';
import { tid } from '@/lib/testid';
import { useNow } from '@/lib/use-now';
import { useOnline } from '@/lib/use-online';
import { AssignDialog } from './assign-dialog';
import { BatchAssignDialog } from './batch-dialog';
import { CouriersTab } from './couriers-tab';
import { DeliveryDialog } from './delivery-dialog';
import { HistoryTab } from './history-tab';
import { Countdown, LateCancelStrip } from './late-cancel';
import { useWaitingForCourier } from './nav-count';
import s from './logistics.module.css';

const T = (id: string) => tid('logistica', id);
type Tab = 'queue' | 'progress' | 'couriers' | 'history';
type KindFilter = 'all' | 'delivery' | 'exchange';

export function WaitChip({ delivery }: { delivery: Pick<Delivery, 'sla' | 'waitingMinutes'> }) {
  const level = waitLevel(delivery);
  return (
    <span className={cx('wb-text-caption-strong', s.wait, level === 'warning' && s.waitWarning, level === 'late' && s.waitLate)} data-testid={T('wait')}>
      <SolarIcon name={level === 'late' ? 'alert' : level === 'warning' ? 'warning' : 'clock'} size={16} duotone={level !== 'normal'} />
      {waitText(delivery)}
    </span>
  );
}

/** Faixa prometida ao cliente e o alerta pelo FIM da faixa (DEC-053). Sempre ícone e texto; sem faixa do servidor, não mostra nada. */
export function EtaChip({ delivery, now }: { delivery: Delivery; now: number }) {
  const band = etaBandText(delivery);
  if (!band) return null;
  const level = etaLevel(delivery, now);
  const text = etaLevelText(delivery, now);
  return (
    <span className={cx('wb-text-caption-strong', s.wait, level === 'ending' && s.waitWarning, level === 'late' && s.waitLate)} data-testid={T('eta')} data-level={level ?? undefined}>
      <SolarIcon name={level === 'late' ? 'alert' : level === 'ending' ? 'warning' : 'clock'} size={16} duotone={level === 'late' || level === 'ending'} />
      {band}
      {level && level !== 'on_time' && text ? ` · ${text}` : ''}
    </span>
  );
}

export function KindBadge({ kind }: { kind: DeliveryKind }) {
  return (
    <span className={cx('wb-text-caption-strong', s.wait)}>
      <SolarIcon name={kind === 'delivery' ? 'box' : 'exchange'} size={16} />
      {KIND_LABEL[kind]}
    </span>
  );
}

export function LogisticsPage() {
  const { canView, canEdit } = useSession();
  if (!canView('logistica')) return <NoAccessState />;
  return <Logistics canWrite={canEdit('logistica')} />;
}

function Logistics({ canWrite }: { canWrite: boolean }) {
  const toast = useToast();
  const online = useOnline();
  const { query, waiting } = useWaitingForCourier();
  const [tab, setTab] = useState<Tab>('queue');
  const [kind, setKind] = useState<KindFilter>('all');
  const [assigning, setAssigning] = useState<Delivery | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [batching, setBatching] = useState<AreaBatch | null>(null);
  const now = useNow(30_000);

  // ---- alerta de pronto para coleta: som opcional, título da aba e toast (onda-4d §0.7)
  const [sound] = useState(createAlertSound);
  const soundOn = useSyncExternalStore(sound.subscribe, sound.isEnabled, () => false);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(waiting.map((row) => row.id));
    if (query.data === undefined) return;
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    const fresh = waiting.filter((row) => !seen.current?.has(row.id));
    seen.current = ids;
    if (fresh.length === 0) return;
    toast.show(`Novo pronto para coleta${fresh[0]?.storeName ? ` · ${fresh[0].storeName}` : ''}`);
    sound.play('normal');
  }, [query.data, waiting, sound, toast]);
  useEffect(() => {
    if (waiting.length === 0) return;
    const original = document.title;
    document.title = `(${waiting.length}) Logística`;
    return () => {
      document.title = original;
    };
  }, [waiting.length]);

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);

  // ---- alerta de atraso: o servidor marca `lateAlertedAt` uma vez por corrida; o som toca uma vez por corrida nesta sessão
  const seenLate = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (query.data === undefined) return;
    const { ids, fresh } = lateAlertsSince(seenLate.current, rows);
    seenLate.current = ids;
    if (fresh.length > 0) sound.play('strong');
  }, [query.data, rows, sound]);

  // ---- "No prazo hoje" (`logistics:report`; o suporte recebe 403 e fica com "Maior espera")
  const today = brasiliaToday(now);
  const stats = useQuery({ queryKey: logisticsKeys.stats(today), queryFn: () => logisticsApi.stats(today, today), refetchInterval: 120_000, retry: false });
  const lateCancels = useMemo(() => rows.filter((row) => pendingLateCancel(row)), [rows]);
  const filterKind = (row: Delivery) => kind === 'all' || (kind === 'delivery' ? row.kind === 'delivery' : row.kind !== 'delivery');
  const queue = useMemo(() => sortQueueByEta(rows.filter((row) => row.status === 'ready_for_collection' && filterKind(row)), now), [rows, kind, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const progress = useMemo(() => rows.filter((row) => row.status !== 'ready_for_collection' && filterKind(row)).sort((a, b) => Date.parse(a.readyAt) - Date.parse(b.readyAt)), [rows, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const longest = Math.max(0, ...waiting.map((row) => row.waitingMinutes ?? 0));
  const lateByEta = useMemo(() => rows.filter((row) => etaLevel(row, now) === 'late').length, [rows, now]);
  const hasEta = rows.some((row) => row.etaToAt);
  const batches = useMemo(() => batchesOf(queue), [queue]);

  async function enableSound() {
    await sound.enable();
  }

  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  let body;
  if (tab === 'couriers') body = <CouriersTab canWrite={canWrite} />;
  else if (tab === 'history') body = <HistoryTab canWrite={canWrite} onOpen={setOpenId} />;
  else if (forbidden) body = <NoAccessState />;
  else if (query.isPending) body = <SkeletonRows rows={4} height={96} label="Carregando a fila" />;
  else if (query.isError && !query.data) body = <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />;
  else {
    const list = tab === 'queue' ? queue : progress;
    body =
      list.length === 0 ? (
        <EmptyState
          icon={Motorcycle}
          title={tab === 'queue' ? 'Nenhuma entrega esperando' : 'Nada em andamento'}
          text={tab === 'queue' ? 'Quando uma loja marcar pronto para coleta, aparece aqui.' : 'Os trabalhos atribuídos aparecem aqui.'}
          actionLabel={tab === 'queue' ? 'Ver em andamento' : 'Ver a fila'}
          onAction={() => setTab(tab === 'queue' ? 'progress' : 'queue')}
          testId={T(tab === 'queue' ? 'empty-fila' : 'empty-andamento')}
        />
      ) : (
        <ul className={s.list} aria-label={tab === 'queue' ? 'Fila de coleta' : 'Em andamento'}>
          {list.map((row, index) => (
            <Row key={row.id} row={row} now={now} tab={tab} primary={index === 0} canWrite={canWrite} online={online} onAssign={() => setAssigning(row)} onOpen={() => setOpenId(row.id)} />
          ))}
        </ul>
      );
  }

  const riskCount = useMemo(() => rows.filter((row) => etaLevel(row, now) === 'ending').length, [rows, now]);
  const lateRows = useMemo(() => rows.filter((row) => etaLevel(row, now) === 'late'), [rows, now]);
  const lateInQueue = lateRows.some((row) => row.status === 'ready_for_collection');

  return (
    <div className={s.page}>
      <PageHeader title="Logística" eyebrow="Entrega pela Webag" description="Despache os pedidos prontos para coleta." />
      {lateByEta > 0 || lateCancels.length > 0 ? (
        <NightBlock
          icon="alert"
          role="alert"
          title={lateByEta > 0 ? `${lateByEta} ${lateByEta === 1 ? 'corrida atrasada' : 'corridas atrasadas'}` : `${lateCancels.length} ${lateCancels.length === 1 ? 'pedido de cancelamento' : 'pedidos de cancelamento'}`}
          testId={T('late-alert')}
          action={<LimaAction onClick={() => setTab(lateCancels.length > 0 || !lateInQueue ? 'progress' : 'queue')} testId={T('late-alert-open')}>{lateCancels.length > 0 || !lateInQueue ? 'Ver em andamento' : 'Ver na fila'}</LimaAction>}
        >
          {lateByEta > 0 ? 'Passaram do fim da faixa prometida ao cliente. A mais urgente fica no topo.' : null}
          {lateCancels[0] ? <> {lateCancels[0].orderNumber ? `#${lateCancels[0].orderNumber}` : 'Um cliente'} pediu cancelamento. Responda em <Countdown respondBy={lateCancels[0].lateCancelRequest!.respondBy} testId={T('late-alert-countdown')} />, senão o sistema aceita.</> : null}
        </NightBlock>
      ) : null}
      <KpiRow>
        <Kpi label="Esperando motoboy" value={waiting.length} tone="night" testId={T('summary-waiting')} />
        <Kpi label="Em risco" value={riskCount} tone={riskCount > 0 ? 'warning' : 'neutral'} hint={riskCount > 0 ? 'Perto do fim da faixa' : undefined} testId={T('summary-risk')} />
        <Kpi label="Atrasadas" value={lateByEta} tone={lateByEta > 0 ? 'danger' : 'neutral'} hint={hasEta ? undefined : 'Sem faixa nas corridas'} testId={T('summary-late')} />
        {stats.data ? (
          <Kpi label="No prazo hoje" value={stats.data.onTime.pct === null ? '—' : `${stats.data.onTime.pct.toLocaleString('pt-BR')}%`} hint={stats.data.onTime.of === 0 ? 'Nenhuma entrega com faixa hoje' : `${stats.data.onTime.count} de ${stats.data.onTime.of} entregas`} testId={T('summary-ontime')} />
        ) : (
          <Kpi label="Maior espera" value={`${longest} min`} testId={T('summary-longest')} />
        )}
      </KpiRow>
      <div className={s.bar} data-testid={T('status-bar')}>
        <div className={s.barGroup}>
          <Switch checked={soundOn} onChange={(on) => (on ? void enableSound() : undefined)} label="Avisar com som" onText="Ligado" offText="Desligado" testId={T('sound-switch')} />
          <span className="wb-text-caption" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {soundOn ? <SpeakerHigh size={20} aria-hidden="true" /> : <SpeakerSlash size={20} aria-hidden="true" />}
            {soundOn ? 'Som ligado' : 'Som desligado: toque em Ligado para ouvir os avisos'}
          </span>
        </div>
        <span className="wb-text-caption" role="status">
          {query.isError ? 'Sem conexão. Mostrando o que já carregou.' : 'Atualiza a cada 15 s'}
        </span>
      </div>
      {!canWrite ? <Banner tone="info">Você pode ver, mas não despachar.</Banner> : null}
      <Tabs
        label="Logística"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'queue', label: `Fila (${waiting.length})`, testId: T('tab-fila') },
          { id: 'progress', label: `Em andamento (${rows.filter((row) => row.status !== 'ready_for_collection').length})`, testId: T('tab-andamento') },
          { id: 'couriers', label: 'Motoboys', testId: T('tab-motoboys') },
          { id: 'history', label: 'Histórico', testId: T('tab-historico') },
        ]}
      />
      {tab === 'queue' || tab === 'progress' ? (
        <div className={s.chips} role="group" aria-label="Filtrar por tipo">
          {([['all', 'Todos'], ['delivery', 'Entregas'], ['exchange', 'Trocas']] as const).map(([id, label]) => (
            <button key={id} type="button" className={cx(s.chip, kind === id && s.chipOn, 'wb-text-body-strong')} aria-pressed={kind === id} onClick={() => setKind(id)} data-testid={T(`filter-${id === 'exchange' ? 'exchange' : id}`)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {tab === 'queue' && canWrite && batches.length > 0 ? (
        <section className={s.block} aria-labelledby="lg-batches" data-testid={T('batches')}>
          <h2 id="lg-batches" className="wb-text-body-strong" style={{ margin: 0 }}>Mesma área, uma ida só</h2>
          <ul className={s.list} aria-label="Lotes por área">
            {batches.map((batch) => (
              <li key={batch.area} className={s.batchRow}>
                <span className="wb-text-body">{batch.label} · {batch.rows.length} pedidos esperando</span>
                <Button variant="secondary" size="sm" onClick={() => setBatching(batch)} disabled={!online} aria-label={`Atribuir o lote de ${batch.label}, ${batch.rows.length} pedidos`} data-testid={T(`batch-${batch.rows[0]!.id}`)}>
                  Atribuir o lote
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {body}
      {batching ? <BatchAssignDialog batch={batching} onClose={() => setBatching(null)} /> : null}
      {assigning ? <AssignDialog delivery={assigning} onClose={() => setAssigning(null)} /> : null}
      {openId ? <DeliveryDialog id={openId} canWrite={canWrite} onClose={() => setOpenId(null)} onAssign={(delivery) => { setOpenId(null); setAssigning(delivery); }} /> : null}
    </div>
  );
}

/** Estado do bloco de prazo (v3): atrasada, em risco, no prazo ou sem faixa (troca e corrida sem promessa). */
function deadlineOf(row: Delivery, now: number): { state: DeadlineState; label: string; value: string; sub: string | undefined } {
  const level = etaLevel(row, now);
  const to = row.etaToAt ? Date.parse(row.etaToAt) : null;
  const clockText = row.etaToAt ? etaBandText({ etaToAt: row.etaToAt }) : null;
  if (level === 'late') {
    const minutes = to ? Math.max(1, Math.round((now - to) / 60_000)) : (row.overdueMinutes ?? 1);
    return { state: 'late', label: 'Atrasada', value: `+${minutes} min`, sub: clockText ?? undefined };
  }
  if (level === 'ending' || level === 'on_time') {
    const minutes = to ? Math.max(0, Math.round((to - now) / 60_000)) : 0;
    return { state: level === 'ending' ? 'risk' : 'ontime', label: level === 'ending' ? 'Em risco' : 'No prazo', value: `${minutes} min`, sub: clockText ?? undefined };
  }
  return { state: 'none', label: row.kind === 'delivery' ? 'Sem faixa' : 'Coleta de troca', value: '—', sub: row.kind === 'delivery' ? undefined : 'Coletar hoje' };
}

const FINAL = new Set(['delivered', 'not_delivered', 'returned_to_store', 'cancelled']);

function Row({ row, now, tab, primary, canWrite, online, onAssign, onOpen }: { row: Delivery; now: number; tab: Tab; primary: boolean; canWrite: boolean; online: boolean; onAssign: () => void; onOpen: () => void }) {
  const queueRow = tab === 'queue';
  const deadline = deadlineOf(row, now);
  const late = deadline.state === 'late';
  return (
    <li>
      <div className={cx(s.row, late && s.rowLate, deadline.state === 'risk' && s.rowRisk)} data-testid={T(queueRow ? `fila.row-${row.id}` : `andamento.row-${row.id}`)}>
        <DeadlineBlock {...deadline} testId={T(`row-${row.id}-deadline`)} />
        <button type="button" className={s.rowMain} onClick={onOpen} aria-label={`${KIND_LABEL[row.kind as DeliveryKind]}, ${queueRow ? waitText(row) : STATUS_LABEL[row.status]}, ${row.storeName ?? 'loja'}, pedido ${row.orderNumber ?? ''}`}>
          <span className={s.rowTop}>
            <KindBadge kind={row.kind as DeliveryKind} />
            {queueRow ? <WaitChip delivery={row} /> : <span className={cx('wb-text-caption-strong', s.wait)}>{STATUS_LABEL[row.status]}{row.courier?.name ? ` · ${row.courier.name}` : ''}</span>}
          </span>
          <span className={s.route}>{row.storeName ?? 'Loja'}{row.destination ? ` \u2192 ${row.destination}` : ''}</span>
          <EtaChip delivery={row} now={now} />
          {row.dropoffPinVerified === false && !FINAL.has(row.status) ? <span className={cx('wb-text-caption-strong', s.wait)} data-testid={T(`row-${row.id}-pin`)}><SolarIcon name="warning" size={16} />Pino do endereço não conferido</span> : null}
          <span className={cx('wb-text-caption', s.muted)}>
            {row.orderNumber ? `#${row.orderNumber} · ` : ''}
            {row.volumes} {row.volumes === 1 ? 'volume' : 'volumes'} · taxa {formatCents(row.fee.amount)}
          </span>
        </button>
        {canWrite && queueRow ? (
          <Button className={cx(s.rowAction, !primary && s.rowActionNight)} variant="primary" onClick={onAssign} disabled={!online} aria-label={`Atribuir motoboy ao pedido ${row.orderNumber ?? ''}`} data-testid={T(`fila.row-${row.id}-assign`)}>
            Atribuir
          </Button>
        ) : null}
        {!queueRow ? (
          <Button className={s.rowAction} variant="secondary" onClick={onOpen} data-testid={T(`andamento.row-${row.id}-next`)}>
            Abrir
          </Button>
        ) : null}
        {pendingLateCancel(row) ? <LateCancelStrip delivery={row} canWrite={canWrite} /> : null}
      </div>
    </li>
  );
}
