'use client';

import { ArrowsClockwise, Warning } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Badge, EmptyState, ErrorState, NoAccessState, SkeletonRows, cx } from '@/components/ui';
import { adminFinanceApi, financeAdminKeys } from '@/lib/api/admin-finance';
import { PERIOD_LABEL, periodOf, type PeriodId } from '@/lib/api/finance';
import { ApiError } from '@/lib/api/errors';
import { formatCents } from '@/lib/format';
import { tid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './admin-finance.module.css';

const T = (id: string) => tid('trocas', `report.${id}`);

/** AT1: onde as trocas custam caro. Receita da taxa e custo das corridas só aparecem para quem pode (financeiro e super admin). */
export function ExchangesReportPage() {
  const { canView } = useSession();
  const online = useOnline();
  const [periodId, setPeriodId] = useState<PeriodId>('30d');
  const period = periodOf(periodId);
  const query = useQuery({ queryKey: financeAdminKeys.exchangesReport(period.from, period.to), queryFn: () => adminFinanceApi.exchangesReport(period.from, period.to), enabled: canView('trocas') });
  if (!canView('trocas')) return <NoAccessState />;
  const data = query.data;
  const totals = data?.totals;
  const money = (m: { amount?: number } | undefined) => (m ? formatCents(m.amount ?? 0) : null);
  return (
    <div className={s.page}>
      <PageHeader title="Relatório de trocas" description="Onde as trocas custam caro, para ajustar taxa, prazo e tabela de medidas." />
      <div className={s.actions} role="group" aria-label="Período">
        {(['7d', '30d', 'month'] as const).map((id) => (
          <button key={id} type="button" aria-pressed={periodId === id} onClick={() => setPeriodId(id)} data-testid={T(`period-${id}`)} className="wb-text-body-strong" style={{ minHeight: 48, padding: '0 16px', borderRadius: 999, border: '2px solid transparent', cursor: 'pointer', font: 'inherit', background: periodId === id ? 'var(--wb-color-brand-100)' : 'var(--wb-color-surface-sunken)', borderColor: periodId === id ? 'var(--wb-color-action-primary)' : 'transparent', color: periodId === id ? 'var(--wb-color-brand-800)' : 'var(--wb-color-text-primary)' }}>
            {PERIOD_LABEL[id]}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <SkeletonRows rows={4} height={96} label="Carregando o relatório" />
      ) : query.isError && !query.data ? (
        <ErrorState offline={!online || (query.error instanceof ApiError && query.error.isNetwork)} onRetry={() => void query.refetch()} />
      ) : !data || !totals || totals.exchanges === 0 ? (
        <EmptyState icon={ArrowsClockwise} title="Ainda sem trocas no período" text="Quando houver, o relatório aparece aqui." testId={T('empty')} />
      ) : (
        <>
          <ul className={s.kpis} aria-label="Resumo">
            <li className={s.kpi} data-testid={T('kpi-count')}><p className={s.kpiValue}>{totals.exchanges}</p><p className={`wb-text-caption ${s.muted}`}>trocas</p></li>
            <li className={s.kpi} data-testid={T('kpi-rate')}><p className={s.kpiValue}>{String(totals.ratePct ?? 0).replace('.', ',')}%</p><p className={`wb-text-caption ${s.muted}`}>taxa de troca ({totals.deliveredOrders} pedidos entregues)</p></li>
            {money(totals.feeRevenue) ? <li className={s.kpi} data-testid={T('kpi-fees')}><p className={s.kpiValue}>{money(totals.feeRevenue)}</p><p className={`wb-text-caption ${s.muted}`}>taxas recebidas</p></li> : null}
            {money(totals.netLogisticsCost) ? <li className={s.kpi} data-testid={T('kpi-cost')}><p className={s.kpiValue}>{money(totals.netLogisticsCost)}</p><p className={`wb-text-caption ${s.muted}`}>custo líquido das corridas</p></li> : null}
          </ul>
          <p className="wb-text-body" style={{ margin: 0 }}>Tamanho ou cor: {totals.sizeColorWithoutSizeChart ?? 0} sem tabela de medidas e {totals.sizeColorWithSizeChart ?? 0} com tabela. Aprovadas sozinhas: {totals.autoApproved ?? 0}. Em mediação: {totals.mediations ?? 0}.</p>
          <h2 className="wb-text-title2" style={{ margin: 0 }}>Por loja</h2>
          <ul className={s.list} data-testid={T('by-store')}>
            {data.byStore.map((row) => (
              <li key={row.storeId} className={cx(s.card, s.row)} data-testid={T(`row-${row.storeId}`)}>
                <span className="wb-text-body-strong">{row.storeName ?? 'Loja'}</span>
                <span className="wb-text-body">{row.exchanges} trocas em {row.deliveredOrders} pedidos · {String(row.ratePct ?? 0).replace('.', ',')}%</span>
                {row.alert ? <Badge tone="danger" icon={<Warning size={16} weight="fill" aria-hidden="true" />}>Atenção: acima de {totals.alertThresholdPct}%</Badge> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
