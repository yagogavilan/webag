import type { OperationsReport, ReportOrderPage } from '@webag/shared';
import { apiDownload, apiRequest } from './client';

/** Relatórios do admin (WB-122, WB-114). Os totais conferem com a lista de pedidos do mesmo filtro. */
export type { OperationsReport, ReportOrderPage };
const A = 'admin' as const;

export interface ReportFilter {
  from: string;
  to: string;
  cityId?: string;
  storeId?: string;
  categoryId?: string;
}
const q = (f: ReportFilter) => ({ from: f.from, to: f.to, cityId: f.cityId, storeId: f.storeId, categoryId: f.categoryId });

export const reportsApi = {
  operations: (f: ReportFilter) => apiRequest<OperationsReport>(A, 'admin/reports/operations', { query: q(f) }),
  orders: (f: ReportFilter, cursor?: string) => apiRequest<ReportOrderPage>(A, 'admin/reports/orders', { query: { ...q(f), cursor, limit: 20 } }),
  exportOperations: (f: ReportFilter) => apiDownload(A, 'admin/reports/operations.csv', q(f)),
  exportOrders: (f: ReportFilter) => apiDownload(A, 'admin/reports/orders.csv', q(f)),
};

export const reportsKeys = {
  operations: (f: ReportFilter) => ['admin', 'reports', 'operations', f] as const,
  orders: (f: ReportFilter) => ['admin', 'reports', 'orders', f] as const,
};

/** Definições em uma linha (RN-15), mostradas ao tocar no `Info` de cada indicador. */
export const KPI_DEFINITION = {
  orders: 'Pedidos que chegaram a "Recebido" (já tem pagamento), contados pelo dia do pagamento em Brasília.',
  gmv: 'Total dos pedidos não cancelados, recusados nem expirados.',
  gmvDone: 'Total só dos pedidos entregues.',
  ticket: 'GMV concluído dividido pelos pedidos entregues.',
  newStores: 'Lojas aprovadas no período.',
  newCustomers: 'Contas de cliente criadas no período.',
  repurchase: 'Clientes com 2 ou mais pedidos entregues em até 30 dias do primeiro. Só entram clientes com 30 dias completos.',
} as const;

export const ACTOR_LABEL = { customer: 'Cliente', store: 'Loja', system: 'Sistema', admin: 'Admin' } as const;
