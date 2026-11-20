'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, SkeletonRows, cx } from '@/components/ui';
import { financeApi, financeKeys, type Period, type StoreSalesDaily } from '@/lib/api/finance';
import { formatCents } from '@/lib/format';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import s from './finance.module.css';

const T = (id: string) => ltid('financeiro', id);
type Point = StoreSalesDaily['data'][number];

/** "19/11" a partir de "2026-11-19" (a data civil de Brasília que a API manda; sem conversão de fuso). */
export const dayLabel = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Resumo lido pelo leitor de tela: total, melhor dia e dias sem venda. Também aparece em texto sob o gráfico. */
export function chartSummary(points: Point[]): string {
  const total = points.reduce((sum, p) => sum + (p.gross?.amount ?? 0), 0);
  const orders = points.reduce((sum, p) => sum + p.orders, 0);
  if (orders === 0) return 'Nenhuma venda no período.';
  const best = points.reduce((a, b) => ((b.gross?.amount ?? 0) > (a.gross?.amount ?? 0) ? b : a));
  const empty = points.filter((p) => p.orders === 0).length;
  return `${orders} ${orders === 1 ? 'pedido' : 'pedidos'}, ${formatCents(total)} no período. Melhor dia: ${dayLabel(best.date)}, ${formatCents(best.gross?.amount ?? 0)}.${empty > 0 ? ` ${empty} ${empty === 1 ? 'dia' : 'dias'} sem venda.` : ''}`;
}

/**
 * Vendas por dia (WB-198): barras simples, sem biblioteca (peso e Android de entrada) e SEMPRE com a tabela equivalente, porque o gráfico
 * sozinho não serve a leitor de tela nem a quem não distingue o tom da barra. A soma da série é a mesma do total do período.
 */
export function SalesChart({ storeId, period }: { storeId: string; period: Period }) {
  const online = useOnline();
  const [table, setTable] = useState(false);
  const query = useQuery({ queryKey: financeKeys.salesDaily(storeId, period), queryFn: () => financeApi.salesDaily(storeId, period) });
  if (query.isPending) return <SkeletonRows rows={1} height={180} label="Carregando o gráfico de vendas" />;
  if (!query.data) {
    return (
      <Banner tone="warning" action={<Button size="sm" variant="secondary" onClick={() => void query.refetch()}>Tentar de novo</Button>} testId={T('chart-error')}>
        {online ? 'Não conseguimos carregar o gráfico de vendas.' : 'Sem conexão. O gráfico volta quando a internet voltar.'}
      </Banner>
    );
  }
  const points = query.data.data;
  const max = Math.max(1, ...points.map((p) => p.gross?.amount ?? 0));
  const summary = chartSummary(points);
  const step = Math.max(1, Math.ceil(points.length / 6));
  return (
    <section className={s.block} aria-labelledby="fin-chart" data-testid={T('chart')}>
      <div className={s.row} style={{ justifyContent: 'space-between' }}>
        <h2 id="fin-chart" className="wb-text-title2">Vendas por dia</h2>
        <Button variant="text" size="sm" onClick={() => setTable((v) => !v)} aria-pressed={table} data-testid={T('chart-toggle')}>{table ? 'Ver gráfico' : 'Ver em tabela'}</Button>
      </div>
      <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('chart-summary')}>{summary}</p>
      {table ? (
        <table className={s.chartTable} data-testid={T('chart-table')}>
          <caption className="wb-text-caption">Vendas por dia no período</caption>
          <thead><tr><th scope="col">Dia</th><th scope="col" className={s.num}>Pedidos</th><th scope="col" className={s.num}>Vendas</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}><th scope="row">{dayLabel(p.date)}</th><td className={s.num}>{p.orders}</td><td className={s.num}>{formatCents(p.gross?.amount ?? 0)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={s.chart} role="img" aria-label={`Gráfico de vendas por dia. ${summary}`}>
          <span className={cx('wb-text-caption', s.chartMax)}>{formatCents(max)}</span>
          <div className={s.bars} aria-hidden="true">
            {points.map((p, index) => {
              const amount = p.gross?.amount ?? 0;
              return (
                <div key={p.date} className={s.barCol} title={`${dayLabel(p.date)}: ${formatCents(amount)}, ${p.orders} ${p.orders === 1 ? 'pedido' : 'pedidos'}`} data-testid={T(`bar-${p.date}`)}>
                  <span className={cx(s.bar, amount === 0 && s.barEmpty)} style={{ height: amount === 0 ? undefined : `${Math.max(4, Math.round((amount / max) * 100))}%` }} />
                  <span className={cx('wb-text-caption', s.barLabel)}>{index % step === 0 ? dayLabel(p.date) : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
