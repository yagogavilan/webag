import type { GetStoreTopProducts200, StatementPage, StoreFinanceSummary, StoreSales, StoreSalesDaily } from '@webag/shared';
import { apiRequest } from './client';

/** Financeiro da loja (WB-075 a 077). Vendas: `sales_values`; resumo e extrato: só o dono (RN-13). */
export type { GetStoreTopProducts200 as TopProducts, StatementPage, StoreFinanceSummary, StoreSales, StoreSalesDaily };
export interface Period {
  from: string;
  to: string;
}

const L = 'lojista' as const;
const base = (storeId: string) => `stores/${storeId}/finance`;

export const financeApi = {
  sales: (storeId: string, period: Period) => apiRequest<StoreSales>(L, `${base(storeId)}/sales`, { query: { ...period } }),
  topProducts: (storeId: string, period: Period, limit = 5) => apiRequest<GetStoreTopProducts200>(L, `${base(storeId)}/sales/top-products`, { query: { ...period, limit } }),
  salesDaily: (storeId: string, period: Period) => apiRequest<StoreSalesDaily>(L, `${base(storeId)}/sales/daily`, { query: { ...period } }),
  summary: (storeId: string, period: Period) => apiRequest<StoreFinanceSummary>(L, `${base(storeId)}/summary`, { query: { ...period } }),
  statement: (storeId: string, period: Period, cursor?: string) => apiRequest<StatementPage>(L, `${base(storeId)}/statement`, { query: { ...period, limit: 20, cursor } }),
  csvUrl: (storeId: string, period: Period) => `/api/proxy/${L}/${base(storeId)}/statement.csv?from=${period.from}&to=${period.to}`,
};

export const financeKeys = {
  sales: (storeId: string, period: Period) => ['lojista', 'finance', storeId, 'sales', period.from, period.to] as const,
  topProducts: (storeId: string, period: Period) => ['lojista', 'finance', storeId, 'top-products', period.from, period.to] as const,
  salesDaily: (storeId: string, period: Period) => ['lojista', 'finance', storeId, 'sales-daily', period.from, period.to] as const,
  summary: (storeId: string, period: Period) => ['lojista', 'finance', storeId, 'summary', period.from, period.to] as const,
  statement: (storeId: string, period: Period) => ['lojista', 'finance', storeId, 'statement', period.from, period.to] as const,
};

const ymd = (date: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);

export type PeriodId = 'today' | '7d' | '30d' | 'month';
export const PERIOD_LABEL: Record<PeriodId, string> = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias', month: 'Este mês' };

/** Intervalo em dias de Brasília, inclusivo nas duas pontas. */
export function periodOf(id: PeriodId, now: Date = new Date()): Period {
  const to = ymd(now);
  if (id === 'today') return { from: to, to };
  if (id === 'month') return { from: `${to.slice(0, 7)}-01`, to };
  const back = id === '7d' ? 6 : 29;
  return { from: ymd(new Date(now.getTime() - back * 86_400_000)), to };
}
