import type { Exchange, ExchangePage } from '@webag/shared';
import { apiRequest } from './client';

/**
 * Trocas no admin (AT3, WB-110): fila de mediação, decisão, lista, detalhe e isenção da taxa de coleta.
 * Mediação: `exchanges:mediate` (super admin e operação). Lista e detalhe: `exchanges:read`.
 */
export type { Exchange, ExchangePage };
export type MediationOrigin = 'customer_contest' | 'store_refusal' | 'inspection_failed';
export interface MediationItem {
  id: string;
  number: string;
  orderId: string;
  storeId: string;
  type: Exchange['type'];
  resolution: Exchange['resolution'];
  origin: MediationOrigin;
  storeReason: string | null;
  customerText: string | null;
  photoCount: number;
  startedAt: string;
  deadlineAt: string;
  overdue: boolean;
  refusalNotAllowedByLaw: boolean;
}
export interface MediationPage {
  data: MediationItem[];
  nextCursor: string | null;
}
export type MediationDecision = 'customer' | 'store';

const A = 'admin' as const;
export const adminExchangesApi = {
  mediations: (cursor?: string) => apiRequest<MediationPage>(A, 'admin/exchanges/mediations', { query: { limit: 50, cursor } }),
  decide: (id: string, body: { decision: MediationDecision; reason: string }) => apiRequest<{ status: 'decided' }>(A, `admin/exchanges/mediations/${id}/decision`, { method: 'POST', body }),
  list: (query: { status?: Exchange['status']; q?: string; cursor?: string } = {}) => apiRequest<ExchangePage>(A, 'admin/exchange-requests', { query: { status: query.status, q: query.q, cursor: query.cursor, limit: 30 } }),
  get: (id: string) => apiRequest<Exchange>(A, `admin/exchange-requests/${id}`),
  waiveFee: (id: string, reason: string) => apiRequest<{ status: Exchange['status']; fee: Exchange['fee']; totalDue: Exchange['totalDue'] }>(A, `admin/exchange-requests/${id}/waive-fee`, { method: 'POST', body: { reason } }),
};

export const adminExchangesKeys = {
  all: ['admin', 'exchanges'] as const,
  mediations: ['admin', 'exchanges', 'mediations'] as const,
  list: (status: string, q: string) => ['admin', 'exchanges', 'list', status, q] as const,
  detail: (id: string) => ['admin', 'exchanges', 'detail', id] as const,
};

export const ORIGIN_LABEL: Record<MediationOrigin, string> = {
  customer_contest: 'O cliente contestou a recusa da loja',
  store_refusal: 'A loja recusou',
  inspection_failed: 'A loja reprovou o item na conferência',
};
export const TYPE_LABEL: Record<Exchange['type'], string> = { withdrawal: 'Desistência (7 dias)', defect: 'Defeito', size_color: 'Tamanho ou cor' };
export const ADMIN_STATUS_LABEL: Record<Exchange['status'], string> = {
  requested: 'Aguardando a loja',
  awaiting_fee: 'Aguardando a taxa do cliente',
  approved: 'Aprovada',
  item_received: 'Item recebido pela loja',
  completed: 'Concluída',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
  in_mediation: 'Em mediação',
};
export const ACTOR_LABEL: Record<string, string> = { customer: 'Cliente', store: 'Loja', system: 'Sistema', admin: 'Webag' };
export const RESOLUTION_LABEL: Record<Exchange['resolution'], string> = { replace: 'Troca por outra peça', refund: 'Reembolso' };

/** Estado da taxa de coleta em texto (nunca só cor): "Pendente", "Paga", "Isenta" ou "Não se aplica". */
export function feeState(exchange: Pick<Exchange, 'method' | 'fee' | 'feePaid'>): 'not_applicable' | 'paid' | 'waived' | 'pending' {
  if (exchange.method === 'drop_at_store') return 'not_applicable';
  if (exchange.feePaid) return 'paid';
  return exchange.fee.amount === 0 ? 'waived' : 'pending';
}
export const FEE_STATE_LABEL = { not_applicable: 'Não se aplica (troca na loja)', paid: 'Paga', waived: 'Isenta', pending: 'Pendente' } as const;

/** "Isentar a taxa" só cabe com a taxa ainda não paga e a troca esperando por ela (a API recusa o resto com 409). */
export const canWaiveFee = (exchange: Pick<Exchange, 'status' | 'method' | 'fee' | 'feePaid'>): boolean => exchange.method === 'pickup_at_home' && exchange.status === 'awaiting_fee' && !exchange.feePaid && exchange.fee.amount > 0;
