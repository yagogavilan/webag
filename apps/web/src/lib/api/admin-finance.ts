import type { ExchangesReport } from '@webag/shared';
import { apiRequest } from './client';

/** Dinheiro e frete no admin (Ondas 4A, 4D e 5): fila de estornos, tabela de frete, comissões e relatório de trocas. */
export type { ExchangesReport };
const A = 'admin' as const;

export interface RefundQueueItem {
  id: string;
  attemptId: string;
  orderReference: string;
  amountCents: number;
  reason: string;
  status: 'pending' | 'exhausted' | 'covered';
  failures: number;
  lastErrorCode: string | null;
  nextAttemptAt: string;
  coveredAt: string | null;
  createdAt: string;
}
export interface Tier {
  fromM: number;
  toM: number;
  feeCents: number;
  exchangeFeeCents: number;
  expectedCostCents: number;
  etaMinutes: number;
}
export interface FeeTable {
  id: string;
  scopeType: 'default' | 'city' | 'neighborhood';
  scopeId: string | null;
  scopeName?: string;
  version: number;
  effectiveFrom: string;
  reason: string;
  createdAt: string;
  tiers: Tier[];
}
export interface CommissionRate {
  id: string;
  pct: number | null;
  startsAt: string;
  endsAt: string | null;
  reason: string;
  createdAt: string;
}

export const adminFinanceApi = {
  refundQueue: (status?: RefundQueueItem['status']) => apiRequest<{ data: RefundQueueItem[]; nextCursor: string | null }>(A, 'admin/payments/refund-queue', { query: { status, limit: 50 } }),
  retryRefund: (intentId: string) => apiRequest<{ status: string }>(A, `admin/payments/refund-queue/${intentId}/retry`, { method: 'POST' }),
  coverRefund: (intentId: string, reason: string) => apiRequest<void>(A, `admin/payments/refund-queue/${intentId}/cover`, { method: 'POST', body: { reason } }),
  feeTables: () => apiRequest<{ data: FeeTable[]; nextCursor: string | null }>(A, 'admin/delivery-fees'),
  putFeeTable: (body: { scopeType: FeeTable['scopeType']; scopeId?: string | null; tiers: Tier[]; reason: string; expectedVersion: number }) => apiRequest<FeeTable>(A, 'admin/delivery-fees', { method: 'PUT', body }),
  storeCommission: (storeId: string) => apiRequest<{ effective: { pct: number; source: 'store' | 'category' | 'default' }; history: CommissionRate[] }>(A, `admin/stores/${storeId}/commission`),
  categoryCommission: (categoryId: string) => apiRequest<{ history: CommissionRate[] }>(A, `admin/categories/${categoryId}/commission`),
  setStoreCommission: (storeId: string, body: { pct: number | null; reason: string }) => apiRequest<unknown>(A, `admin/stores/${storeId}/commission`, { method: 'PUT', body }),
  setCategoryCommission: (categoryId: string, body: { pct: number | null; reason: string }) => apiRequest<unknown>(A, `admin/categories/${categoryId}/commission`, { method: 'PUT', body }),
  exchangesReport: (from: string, to: string) => apiRequest<ExchangesReport>(A, 'admin/exchanges/report', { query: { from, to } }),
};

export const financeAdminKeys = {
  refunds: (status?: string) => ['admin', 'refund-queue', status ?? 'all'] as const,
  fees: ['admin', 'fee-tables'] as const,
  commissionStore: (id: string) => ['admin', 'commission', 'store', id] as const,
  commissionCategory: (id: string) => ['admin', 'commission', 'category', id] as const,
  exchangesReport: (from: string, to: string) => ['admin', 'exchanges-report', from, to] as const,
};
