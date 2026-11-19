'use client';

import { ArrowsClockwise, Motorcycle, Package, SpeakerHigh, SpeakerSlash, Warning, WarningCircle, Clock } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, EmptyState, ErrorState, NoAccessState, SkeletonRows, Switch, Tabs, cx, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { KIND_LABEL, STATUS_LABEL, sortQueue, waitLevel, waitText, type Delivery, type DeliveryKind } from '@/lib/api/logistics';
import { formatCents } from '@/lib/format';
import { createAlertSound } from '@/lib/orders/alert-sound';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { AssignDialog } from './assign-dialog';
import { CouriersTab } from './couriers-tab';
import { DeliveryDialog } from './delivery-dialog';
import { HistoryTab } from './history-tab';
import { useWaitingForCourier } from './nav-count';
import s from './logistics.module.css';

const T = (id: string) => tid('logistica', id);
type Tab = 'queue' | 'progress' | 'couriers' | 'history';
type KindFilter = 'all' | 'delivery' | 'exchange';

export function WaitChip({ delivery }: { delivery: Pick<Delivery, 'sla' | 'waitingMinutes'> }) {
  const level = waitLevel(delivery);
  return (
    <span className={cx('wb-text-caption-strong', s.wait, level === 'warning' && s.waitWarning, level === 'late' && s.waitLate)} data-testid={T('wait')}>
      {level === 'warning' ? <Warning size={16} weight="fill" aria-hidden="true" /> : level === 'late' ? <WarningCircle size={16} weight="fill" aria-hidden="true" /> : <Clock size={16} aria-hidden="true" />}
      {waitText(delivery)}
    </span>
  );
}

export function KindBadge({ kind }: { kind: DeliveryKind }) {
  const Icon = kind === 'delivery' ? Package : ArrowsClockwise;
  return (
    <span className={cx('wb-text-caption-strong', s.wait)}>
      <Icon size={16} aria-hidden="true" />
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
  const filterKind = (row: Delivery) => kind === 'all' || (kind === 'delivery' ? row.kind === 'delivery' : row.kind !== 'delivery');
  const queue = useMemo(() => sortQueue(rows.filter((row) => row.status === 'ready_for_collection' && filterKind(row))), [rows, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const progress = useMemo(() => rows.filter((row) => row.status !== 'ready_for_collection' && filterKind(row)).sort((a, b) => Date.parse(a.readyAt) - Date.parse(b.readyAt)), [rows, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const longest = Math.max(0, ...waiting.map((row) => row.waitingMinutes ?? 0));

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
            <Row key={row.id} row={row} tab={tab} primary={index === 0} canWrite={canWrite} online={online} onAssign={() => setAssigning(row)} onOpen={() => setOpenId(row.id)} />
          ))}
        </ul>
      );
  }

  return (
    <div className={s.page}>
      <PageHeader title="Logística" description="Despache os pedidos prontos para coleta." />
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
      <ul className={s.summary} aria-label="Resumo">
        <li className={s.kpi} data-testid={T('summary-waiting')}>
          <p className={s.kpiValue}>{waiting.length}</p>
          <p className={cx('wb-text-caption', s.kpiLabel)}>{waiting.length === 1 ? 'esperando' : 'esperando'}</p>
        </li>
        <li className={s.kpi} data-testid={T('summary-longest')}>
          <p className={s.kpiValue}>{longest} min</p>
          <p className={cx('wb-text-caption', s.kpiLabel)}>maior espera</p>
        </li>
        <li className={s.kpi}>
          <p className={s.kpiValue}>{progress.length}</p>
          <p className={cx('wb-text-caption', s.kpiLabel)}>em andamento</p>
        </li>
      </ul>
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
      {body}
      {assigning ? <AssignDialog delivery={assigning} onClose={() => setAssigning(null)} /> : null}
      {openId ? <DeliveryDialog id={openId} canWrite={canWrite} onClose={() => setOpenId(null)} onAssign={(delivery) => { setOpenId(null); setAssigning(delivery); }} /> : null}
    </div>
  );
}

function Row({ row, tab, primary, canWrite, online, onAssign, onOpen }: { row: Delivery; tab: Tab; primary: boolean; canWrite: boolean; online: boolean; onAssign: () => void; onOpen: () => void }) {
  const queueRow = tab === 'queue';
  return (
    <li>
      <div className={s.row} data-testid={T(queueRow ? `fila.row-${row.id}` : `andamento.row-${row.id}`)}>
        <button type="button" className={s.rowMain} onClick={onOpen} aria-label={`${KIND_LABEL[row.kind as DeliveryKind]}, ${queueRow ? waitText(row) : STATUS_LABEL[row.status]}, ${row.storeName ?? 'loja'}, pedido ${row.orderNumber ?? ''}`}>
          <span className={s.rowTop}>
            {queueRow ? <WaitChip delivery={row} /> : <span className={cx('wb-text-caption-strong', s.wait)}>{STATUS_LABEL[row.status]}{row.courier?.name ? ` · ${row.courier.name}` : ''}</span>}
            <KindBadge kind={row.kind as DeliveryKind} />
          </span>
          <span className="wb-text-body-strong">{row.storeName ?? 'Loja'}{row.destination ? ` > ${row.destination}` : ''}</span>
          <span className={cx('wb-text-caption', s.muted)}>
            {row.orderNumber ? `#${row.orderNumber} · ` : ''}
            {row.volumes} {row.volumes === 1 ? 'volume' : 'volumes'} · taxa {formatCents(row.fee.amount)}
          </span>
        </button>
        {canWrite && queueRow ? (
          <Button className={s.rowAction} variant={primary ? 'primary' : 'secondary'} onClick={onAssign} disabled={!online} aria-label={`Atribuir motoboy ao pedido ${row.orderNumber ?? ''}`} data-testid={T(`fila.row-${row.id}-assign`)}>
            Atribuir
          </Button>
        ) : null}
        {!queueRow ? (
          <Button className={s.rowAction} variant="secondary" onClick={onOpen} data-testid={T(`andamento.row-${row.id}-next`)}>
            Abrir
          </Button>
        ) : null}
      </div>
    </li>
  );
}
