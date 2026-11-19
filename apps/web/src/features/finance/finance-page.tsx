'use client';

import { DownloadSimple, Wallet } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Badge, Banner, Button, EmptyState, ErrorState, SkeletonRows, Tabs, cx, useToast } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import { LojistaNoAccess } from '@/features/loja/settings-screen';
import { ApiError } from '@/lib/api/errors';
import { PERIOD_LABEL, financeApi, financeKeys, periodOf, type PeriodId } from '@/lib/api/finance';
import { formatClock, formatCents, formatDateTime } from '@/lib/format';
import { canSeeFinance } from '@/lib/lojista-access';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { SalesChart } from './sales-chart';
import s from './finance.module.css';

const T = (id: string) => ltid('financeiro', id);
type Tab = 'summary' | 'payments' | 'statement';
const money = (m: { amount?: number } | undefined): string => formatCents(m?.amount ?? 0);
const PAYOUT_LABEL = { pending: 'Pedido em andamento', in_grace: 'Em carência', released: 'Liberado' } as const;

/** F1: resumo, recebimentos e extrato. Só o dono (RN-13); o funcionário vê "Sem acesso". */
export function FinancePage() {
  const { store: query } = useMerchant();
  const store = query.data;
  if (query.isPending) return <SkeletonRows rows={4} height={96} label="Carregando o financeiro" />;
  if (!store || !canSeeFinance(store)) return <LojistaNoAccess />;
  return <Finance storeId={store.id} />;
}

function Finance({ storeId }: { storeId: string }) {
  const [periodId, setPeriodId] = useState<PeriodId>('30d');
  const [tab, setTab] = useState<Tab>('summary');
  const period = periodOf(periodId);
  return (
    <div className={s.page}>
      <PageHeader title="Financeiro" description="Vendas, comissão do Webag e o que você recebe." />
      <div className={s.periods} role="group" aria-label="Período">
        {(Object.keys(PERIOD_LABEL) as PeriodId[]).map((id) => (
          <button key={id} type="button" className={cx(s.chip, periodId === id && s.chipOn, 'wb-text-body-strong')} aria-pressed={periodId === id} onClick={() => setPeriodId(id)} data-testid={T(`period-${id}`)}>
            {PERIOD_LABEL[id]}
          </button>
        ))}
      </div>
      <Tabs
        label="Financeiro"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: 'Resumo', testId: T('tab-summary') },
          { id: 'payments', label: 'Recebimentos', testId: T('tab-payments') },
          { id: 'statement', label: 'Extrato', testId: T('tab-statement') },
        ]}
      />
      {tab === 'statement' ? <Statement storeId={storeId} period={period} /> : <Summary storeId={storeId} period={period} view={tab} />}
    </div>
  );
}

function Summary({ storeId, period, view }: { storeId: string; period: { from: string; to: string }; view: 'summary' | 'payments' }) {
  const online = useOnline();
  const router = useRouter();
  const query = useQuery({ queryKey: financeKeys.summary(storeId, period), queryFn: () => financeApi.summary(storeId, period) });
  if (query.isPending) return <SkeletonRows rows={4} height={96} label="Carregando os valores" />;
  if (query.isError && !query.data) return <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} testId={T('error')} />;
  const data = query.data;
  if (!data) return null;
  if (data.sales.orders === 0 && view === 'summary') {
    return <EmptyState icon={Wallet} title="Ainda sem vendas" text="Quando o primeiro pedido for pago, os números aparecem aqui." actionLabel="Ver meus pedidos" onAction={() => router.push(asRoute('/lojista/pedidos'))} testId={T('empty')} />;
  }
  const { receivable } = data;
  if (view === 'payments') {
    return (
      <div className={s.page}>
        <Banner tone="info">Você recebe direto na sua conta Mercado Pago. Aqui você acompanha o que já foi liberado. A carência é de {receivable.graceDays ?? 0} dias depois da entrega.</Banner>
        <ul className={s.kpis} aria-label="Recebimentos">
          <li className={s.kpi} data-testid={T('kpi-pending')}>
            <p className={cx('wb-text-caption-strong', s.kpiLabel)}>Pedidos em andamento</p>
            <p className={s.kpiValue}>{money(receivable.pending?.amount)}</p>
            <p className={cx('wb-text-caption', s.kpiNote)}>{receivable.pending?.orders ?? 0} pedidos</p>
          </li>
          <li className={s.kpi} data-testid={T('kpi-grace')}>
            <p className={cx('wb-text-caption-strong', s.kpiLabel)}>Em carência</p>
            <p className={s.kpiValue}>{money(receivable.inGrace?.amount)}</p>
            <p className={cx('wb-text-caption', s.kpiNote)}>{receivable.inGrace?.orders ?? 0} pedidos</p>
          </li>
          <li className={s.kpi} data-testid={T('kpi-received')}>
            <p className={cx('wb-text-caption-strong', s.kpiLabel)}>Já liberado</p>
            <p className={s.kpiValue}>{money(receivable.released?.amount)}</p>
            <p className={cx('wb-text-caption', s.kpiNote)}>{receivable.released?.orders ?? 0} pedidos</p>
          </li>
        </ul>
      </div>
    );
  }
  return (
    <div className={s.page}>
      <ul className={s.kpis} aria-label="Resumo do período">
        <li className={s.kpi} data-testid={T('kpi-gross')}>
          <p className={cx('wb-text-caption-strong', s.kpiLabel)}>Vendas</p>
          <p className={s.kpiValue}>{money(data.sales.gross)}</p>
          <p className={cx('wb-text-caption', s.kpiNote)}>{data.sales.orders} pedidos</p>
        </li>
        <li className={s.kpi} data-testid={T('kpi-ticket')}>
          <p className={cx('wb-text-caption-strong', s.kpiLabel)}>Ticket médio</p>
          <p className={s.kpiValue}>{money(data.sales.averageTicket)}</p>
        </li>
        <li className={s.kpi} data-testid={T('kpi-net')}>
          <p className={cx('wb-text-caption-strong', s.kpiLabel)}>Você recebe</p>
          <p className={s.kpiValue}>{money(data.net)}</p>
          <p className={cx('wb-text-caption', s.kpiNote)}>Depois da comissão e da tarifa</p>
        </li>
      </ul>
      <SalesChart storeId={storeId} period={period} />
      <section className={s.block} aria-labelledby="fin-comp" data-testid={T('summary')}>
        <h2 id="fin-comp" className="wb-text-title2">Como chegamos neste valor</h2>
        <dl className={s.sum}>
          <dt>Vendas</dt>
          <dd>{money(data.sales.gross)}</dd>
          <dt>Comissão do Webag</dt>
          <dd data-testid={T('kpi-commission')}>- {money(data.commission.net)}</dd>
          <dt>Tarifa do pagamento</dt>
          <dd data-testid={T('kpi-fee')}>- {money(data.providerFees)}</dd>
          <dt>Estornos</dt>
          <dd data-testid={T('kpi-refunds')}>- {money(data.refunds)}</dd>
          <dt className={s.sumStrong}>Líquido</dt>
          <dd className={s.sumStrong}>{money(data.net)}</dd>
        </dl>
      </section>
      <p className="wb-text-caption" role="status" data-testid={T('updated')} style={{ margin: 0 }}>
        {query.isError ? `Atualizado às ${formatClock(new Date(query.dataUpdatedAt))}. Sem conexão agora.` : `Atualizado às ${formatClock(new Date(query.dataUpdatedAt))}.`}
      </p>
    </div>
  );
}

function Statement({ storeId, period }: { storeId: string; period: { from: string; to: string } }) {
  const online = useOnline();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const query = useInfiniteQuery({
    queryKey: financeKeys.statement(storeId, period),
    queryFn: ({ pageParam }) => financeApi.statement(storeId, period, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  async function exportCsv() {
    if (!online) {
      toast.show('Conecte-se para exportar.');
      return;
    }
    setExporting(true);
    try {
      const response = await fetch(financeApi.csvUrl(storeId, period), { credentials: 'same-origin', headers: { 'x-webag-client': 'web' } });
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `extrato-${period.from}-a-${period.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.show('Extrato exportado.');
    } catch {
      toast.show('Não foi possível exportar. Tente de novo.');
    } finally {
      setExporting(false);
    }
  }

  if (query.isPending) return <SkeletonRows rows={6} height={72} label="Carregando o extrato" />;
  if (query.isError && !query.data) return <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} testId={T('error')} />;
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className={s.page}>
      <div className={s.row}>
        <Button icon={<DownloadSimple size={24} aria-hidden="true" />} onClick={() => void exportCsv()} loading={exporting} loadingLabel="Preparando…" data-testid={T('export')}>
          Exportar CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="wb-text-body" data-testid={T('statement-empty')}>Sem lançamentos neste período.</p>
      ) : (
        <ul className={s.stmt} aria-label="Extrato por pedido">
          {rows.map((row) => (
            <li key={row.orderId} className={s.stmtRow} data-testid={T(`payment-${row.orderId}`)}>
              <span className="wb-text-body-strong">{row.number}</span>
              <span className={cx('wb-text-body-strong', s.num)}>{money(row.net)}</span>
              <span className="wb-text-caption">{formatDateTime(row.paidAt)} · Vendas {money(row.gross)} · Comissão {money(row.commission)}</span>
              <span className={s.num}>
                <Badge tone={row.payoutStatus === 'released' ? 'success' : row.payoutStatus === 'in_grace' ? 'warning' : 'neutral'}>{PAYOUT_LABEL[row.payoutStatus]}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Carregando…" data-testid={T('page-next')}>
          Ver mais lançamentos
        </Button>
      ) : null}
    </div>
  );
}
