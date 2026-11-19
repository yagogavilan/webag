'use client';

import { ArrowDown, ArrowUp, ChartBar, DownloadSimple, Info, Minus } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, EmptyState, ErrorState, NoAccessState, SelectField, SkeletonRows, TextField, cx, ui, useToast } from '@/components/ui';
import k from '@/components/panel/kit.module.css';
import { adminApi, keys } from '@/lib/api/admin';
import { adminStoresApi } from '@/lib/api/admin-stores';
import { ACTOR_LABEL, KPI_DEFINITION, reportsApi, reportsKeys, type OperationsReport, type ReportFilter } from '@/lib/api/admin-reports';
import { ApiError } from '@/lib/api/errors';
import { saveBlob } from '@/lib/api/client';
import { PERIOD_LABEL, periodOf, type PeriodId } from '@/lib/api/finance';
import { formatCents, formatDateTime } from '@/lib/format';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';

const T = (id: string) => tid('relatorios', id);
type Preset = PeriodId | 'custom';

function Variation({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <span className="wb-text-caption">sem comparação</span>;
  const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : Minus;
  const sign = pct > 0 ? '+' : '';
  return (
    <span className="wb-text-caption" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Icon size={14} weight="bold" aria-hidden="true" />
      {sign}{pct.toFixed(0)}% vs. período anterior
    </span>
  );
}

function Kpi({ id, label, value, speak, definition, pct }: { id: string; label: string; value: string; speak: string; definition: string; pct?: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={k.kpi} data-testid={T(`kpi-${id}`)}>
      <span className="wb-text-caption" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <button type="button" className={ui.iconButton} style={{ minWidth: 32, minHeight: 32 }} aria-label={`O que é ${label}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid={T(`kpi-${id}-info`)}>
          <Info size={16} aria-hidden="true" />
        </button>
      </span>
      <p className={k.kpiValue} aria-label={`${label}, ${speak}`}>{value}</p>
      {pct !== undefined ? <Variation pct={pct} /> : null}
      {open ? <p className="wb-text-caption" style={{ margin: 0 }}>{definition}</p> : null}
    </li>
  );
}

/** Pedidos por dia: barras em SVG (cor de marca) e tabela como alternativa em texto (a11y). */
export function OrdersChart({ series }: { series: OperationsReport['series'] }) {
  const max = Math.max(1, ...series.map((d) => d.orders));
  const w = 100 / Math.max(1, series.length);
  const total = series.reduce((sum, d) => sum + d.orders, 0);
  return (
    <figure style={{ margin: 0 }} data-testid={T('chart')}>
      <figcaption className="wb-text-title2" style={{ marginBottom: 8 }}>Pedidos por dia</figcaption>
      <svg className={k.chart} viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Pedidos por dia: ${total} no período, de ${series[0]?.orders ?? 0} no primeiro dia a ${series.at(-1)?.orders ?? 0} no último`}>
        {series.map((d, i) => {
          const h = (d.orders / max) * 38;
          return <rect key={d.date} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={h} rx="0.6" fill="var(--wb-color-brand-600)" />;
        })}
      </svg>
      <details>
        <summary className="wb-text-body-strong" style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Ver em tabela</summary>
        <table className={ui.table}>
          <caption className={ui.srOnly}>Pedidos e GMV por dia</caption>
          <thead><tr><th>Dia</th><th>Pedidos</th><th>GMV</th></tr></thead>
          <tbody>{series.map((d) => <tr key={d.date}><td data-primary>{d.date.split('-').reverse().join('/')}</td><td data-label="Pedidos">{d.orders}</td><td data-label="GMV">{formatCents(d.gmv.amount)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

export function ReportsPage() {
  const { canView, user } = useSession();
  const online = useOnline();
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [cityId, setCityId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [exporting, setExporting] = useState<'ops' | 'orders' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(false);

  const period = preset === 'custom' ? custom : periodOf(preset);
  const validPeriod = Boolean(period.from && period.to && period.from <= period.to);
  const filter: ReportFilter = { from: period.from, to: period.to, ...(cityId ? { cityId } : {}), ...(storeId ? { storeId } : {}), ...(categoryId ? { categoryId } : {}) };
  const enabled = canView('relatorios') && validPeriod;
  const query = useQuery({ queryKey: reportsKeys.operations(filter), queryFn: () => reportsApi.operations(filter), enabled });
  const cities = useQuery({ queryKey: keys.cities, queryFn: adminApi.cities, enabled: canView('relatorios') });
  const categories = useQuery({ queryKey: keys.categories, queryFn: adminApi.categories, enabled: canView('relatorios') });
  const stores = useQuery({ queryKey: ['admin', 'report-stores'], queryFn: () => adminStoresApi.list('approved'), enabled: canView('relatorios') });
  const orders = useInfiniteQuery({ queryKey: reportsKeys.orders(filter), queryFn: ({ pageParam }) => reportsApi.orders(filter, pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: (last) => last.nextCursor ?? undefined, enabled: enabled && showOrders });

  if (!canView('relatorios')) return <NoAccessState />;
  const data = query.data;
  const showRevenue = user.adminProfile === 'super_admin' || user.adminProfile === 'finance';

  async function exportCsv(kind: 'ops' | 'orders') {
    setExporting(kind);
    setExportError(null);
    try {
      const { blob, fileName } = await (kind === 'ops' ? reportsApi.exportOperations(filter) : reportsApi.exportOrders(filter));
      saveBlob(blob, fileName);
      toast.show('Arquivo pronto.');
    } catch (error) {
      setExportError(error instanceof ApiError && error.isNetwork ? 'Conecte-se para exportar.' : error instanceof ApiError && error.code === 'EXPORT_TOO_LARGE' ? 'A exportação é grande. Reduza o período ou filtre por loja.' : 'Não foi possível exportar agora. Tente de novo.');
    } finally {
      setExporting(null);
    }
  }

  const flatCategories = (categories.data?.data ?? []).flatMap((c) => [{ id: c.id, name: c.name }, ...c.children.map((x) => ({ id: x.id, name: `${c.name} / ${x.name}` }))]);
  const clear = () => { setCityId(''); setStoreId(''); setCategoryId(''); };

  return (
    <div className={k.page}>
      <PageHeader title="Relatórios" description="Números que batem com a lista de pedidos do mesmo filtro." action={<Button variant="secondary" icon={<DownloadSimple size={20} aria-hidden="true" />} loading={exporting === 'ops'} loadingLabel="Preparando…" disabled={!data || data.empty} onClick={() => void exportCsv('ops')} data-testid={T('export')}>Exportar CSV</Button>} />
      <div className={k.actions} role="group" aria-label="Período">
        {(['today', '7d', '30d', 'month'] as const).map((id) => (
          <button key={id} type="button" className={cx(ui.chip, 'wb-text-body')} aria-pressed={preset === id} onClick={() => setPreset(id)} data-testid={T(`period-${id}`)}>{PERIOD_LABEL[id]}</button>
        ))}
        <button type="button" className={cx(ui.chip, 'wb-text-body')} aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')} data-testid={T('period-custom')}>Outro período</button>
      </div>
      {preset === 'custom' ? (
        <div className={k.grid2}>
          <TextField label="De" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} data-testid={T('filter-from')} />
          <TextField label="Até" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} error={custom.from && custom.to && custom.from > custom.to ? 'O fim precisa ser depois do início.' : undefined} data-testid={T('filter-to')} />
        </div>
      ) : null}
      <div className={k.grid2}>
        <SelectField label="Cidade" value={cityId} onChange={(e) => setCityId(e.target.value)} data-testid={T('filter-city')}><option value="">Todas</option>{(cities.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
        <SelectField label="Loja" value={storeId} onChange={(e) => setStoreId(e.target.value)} data-testid={T('filter-store')}><option value="">Todas</option>{(stores.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name ?? 'Loja'}</option>)}</SelectField>
        <SelectField label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid={T('filter-category')}><option value="">Todas</option>{flatCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
      </div>
      {exportError ? <Banner tone="danger" testId={T('export-error')}>{exportError}</Banner> : null}

      {!validPeriod ? <p className={k.muted}>Escolha o período para ver os números.</p> : query.isPending ? (
        <SkeletonRows rows={3} height={96} label="Carregando relatório" />
      ) : query.isError && !data ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : !data || data.empty ? (
        <EmptyState icon={ChartBar} title="Sem dados neste período" text="Tente outro período ou tire um filtro." actionLabel="Limpar filtros" onAction={clear} testId={T('empty')} />
      ) : (
        <>
          <ul className={k.kpis} aria-label="Indicadores">
            <Kpi id="orders" label="Pedidos" value={String(data.kpis.orders)} speak={`${data.kpis.orders} pedidos`} definition={KPI_DEFINITION.orders} pct={data.variation.ordersPct} />
            <Kpi id="gmv" label="GMV" value={formatCents(data.kpis.gmv.amount)} speak={formatCents(data.kpis.gmv.amount)} definition={KPI_DEFINITION.gmv} pct={data.variation.gmvPct} />
            <Kpi id="gmv-done" label="GMV concluído" value={formatCents(data.kpis.gmvDelivered.amount)} speak={formatCents(data.kpis.gmvDelivered.amount)} definition={KPI_DEFINITION.gmvDone} pct={data.variation.gmvDeliveredPct} />
            <Kpi id="ticket" label="Ticket médio" value={formatCents(data.kpis.averageTicket.amount)} speak={formatCents(data.kpis.averageTicket.amount)} definition={KPI_DEFINITION.ticket} pct={data.variation.averageTicketPct} />
            <Kpi id="new-stores" label="Novas lojas" value={String(data.kpis.newStores)} speak={`${data.kpis.newStores} lojas`} definition={KPI_DEFINITION.newStores} pct={data.variation.newStoresPct} />
            <Kpi id="new-customers" label="Novos clientes" value={String(data.kpis.newCustomers)} speak={`${data.kpis.newCustomers} clientes`} definition={KPI_DEFINITION.newCustomers} pct={data.variation.newCustomersPct} />
            <Kpi id="repurchase" label="Recompra em 30 dias" value={data.kpis.repurchase.ratePct === null ? 'sem base' : `${data.kpis.repurchase.ratePct.toFixed(1).replace('.', ',')}%`} speak={data.kpis.repurchase.ratePct === null ? 'sem clientes com 30 dias completos' : `${data.kpis.repurchase.repurchased} de ${data.kpis.repurchase.cohort} clientes`} definition={KPI_DEFINITION.repurchase} />
          </ul>
          <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('see-orders-link-wrap')}>
            <button type="button" className={cx(ui.chip, 'wb-text-body')} aria-expanded={showOrders} onClick={() => setShowOrders((v) => !v)} data-testid={T('see-orders-link')}>
              {showOrders ? 'Esconder os pedidos deste filtro' : `Ver os ${data.kpis.orders} pedidos deste filtro`}
            </button>
          </p>
          <OrdersChart series={data.series} />
          <section aria-labelledby="canc-title">
            <h2 id="canc-title" className="wb-text-title2" style={{ margin: '0 0 8px' }}>Cancelamentos por quem e por motivo</h2>
            <p className={k.muted}>{data.kpis.cancelledOrders} cancelados ou recusados ({data.kpis.cancellationRatePct.toFixed(1).replace('.', ',')}% dos pedidos).</p>
            {data.cancellations.length === 0 ? <p className="wb-text-body">Nenhum cancelamento no período.</p> : (
              <div className={ui.tableWrap}>
                <table className={ui.table} data-testid={T('cancellations-table')}>
                  <caption className={ui.srOnly}>Cancelamentos</caption>
                  <thead><tr><th>Quem</th><th>Motivo</th><th>Pedidos</th><th>Valor</th></tr></thead>
                  <tbody>{data.cancellations.map((c) => <tr key={`${c.actor}-${c.reason}`}><td data-primary>{ACTOR_LABEL[c.actor]}</td><td data-label="Motivo">{c.reason}</td><td data-label="Pedidos">{c.orders}</td><td data-label="Valor">{formatCents(c.value.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
          {showRevenue && data.revenue.orders ? (
            <section aria-labelledby="rev-title" data-testid={T('revenue')}>
              <h2 id="rev-title" className="wb-text-title2" style={{ margin: '0 0 8px' }}>Receita do Webag no período</h2>
              <ul className={k.kpis}>
                <li className={k.kpi}><span className="wb-text-caption">Comissão</span><p className={k.kpiValue}>{formatCents(data.revenue.orders.commission?.amount ?? 0)}</p></li>
                <li className={k.kpi}><span className="wb-text-caption">Taxa de serviço</span><p className={k.kpiValue}>{formatCents(data.revenue.orders.serviceFee?.amount ?? 0)}</p></li>
                <li className={k.kpi}><span className="wb-text-caption">Taxa de entrega</span><p className={k.kpiValue}>{formatCents(data.revenue.orders.deliveryFee?.amount ?? 0)}</p></li>
              </ul>
              <p className={cx('wb-text-caption', k.muted)}>Fonte: pedidos do período; o livro-razão fecha com o mesmo total.</p>
            </section>
          ) : null}
          {showOrders ? (
            <section aria-labelledby="ord-title" data-testid={T('orders')}>
              <div className={k.row}>
                <h2 id="ord-title" className="wb-text-title2" style={{ margin: 0 }}>Pedidos deste filtro</h2>
                <Button variant="secondary" size="sm" loading={exporting === 'orders'} loadingLabel="Preparando…" onClick={() => void exportCsv('orders')} data-testid={T('export-orders')}>Exportar pedidos em CSV</Button>
              </div>
              {orders.isPending ? <SkeletonRows rows={3} height={56} label="Carregando pedidos" /> : orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : (
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <caption className={ui.srOnly}>Pedidos</caption>
                    <thead><tr><th>Pedido</th><th>Loja</th><th>Estado</th><th>Total</th><th>Comissão</th><th>Pago em</th></tr></thead>
                    <tbody>{orders.data.pages.flatMap((p) => p.data).map((o) => <tr key={o.id} data-testid={T(`order-${o.id}`)}><td data-primary>#{o.number}</td><td data-label="Loja">{o.store.name ?? '-'}</td><td data-label="Estado">{o.status}</td><td data-label="Total">{formatCents(o.total.amount)}</td><td data-label="Comissão">{formatCents(o.commission.amount)}</td><td data-label="Pago em">{formatDateTime(o.paidAt)}</td></tr>)}</tbody>
                  </table>
                  {orders.hasNextPage ? <Button variant="secondary" loading={orders.isFetchingNextPage} loadingLabel="Carregando…" onClick={() => void orders.fetchNextPage()}>Carregar mais</Button> : null}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
      {!online ? <Banner tone="warning" offline>Sem conexão. Os números mostrados podem estar desatualizados.</Banner> : null}
    </div>
  );
}
