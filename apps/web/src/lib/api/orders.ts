import type { OrderStatus, OrderTimelineEntry, StoreOrder, StoreOrderAction, StoreOrderCounts, StoreOrderPage, StoreOrderSummary } from '@webag/shared';
import { apiRequest } from './client';

/**
 * Pedidos da loja (Onda 4C, WB-067 a 072). Os tipos vêm do cliente gerado em `@webag/shared` (openapi.yaml: `/v1/stores/{storeId}/orders`);
 * a chamada passa pelo BFF, que guarda o token no cookie HttpOnly. Tempo real: por polling; o Socket.IO entra aqui quando existir
 * (ver `docs/arquitetura/pendencias-contrato-web-lojista.md`, seção Onda 4C).
 */
export type { OrderStatus, OrderTimelineEntry, StoreOrder, StoreOrderAction, StoreOrderCounts, StoreOrderPage, StoreOrderSummary };
export type OrderScope = 'new' | 'in_progress' | 'history';
export type OrderAdvanceStatus = 'in_preparation' | 'out_for_delivery' | 'ready_for_pickup' | 'delivered';

const L = 'lojista' as const;
const base = (storeId: string) => `stores/${storeId}/orders`;

export interface OrderListQuery {
  scope?: OrderScope;
  /** Código do pedido (`WB-XXXXX`): é o único filtro que a API aceita além do estado. */
  number?: string;
  cursor?: string | undefined;
  limit?: number;
}

export const ordersApi = {
  list: (storeId: string, query: OrderListQuery = {}) => apiRequest<StoreOrderPage>(L, base(storeId), { query: { scope: query.scope, number: query.number, cursor: query.cursor, limit: query.limit } }),
  counts: (storeId: string) => apiRequest<StoreOrderCounts>(L, `${base(storeId)}/counts`),
  get: (storeId: string, orderId: string) => apiRequest<StoreOrder>(L, `${base(storeId)}/${orderId}`),
  accept: (storeId: string, orderId: string) => apiRequest<StoreOrder>(L, `${base(storeId)}/${orderId}/accept`, { method: 'POST' }),
  refuse: (storeId: string, orderId: string, reason: string) => apiRequest<StoreOrder>(L, `${base(storeId)}/${orderId}/refuse`, { method: 'POST', body: { reason } }),
  advance: (storeId: string, orderId: string, status: OrderAdvanceStatus, pickupCode?: string) =>
    apiRequest<StoreOrder>(L, `${base(storeId)}/${orderId}/status`, { method: 'POST', body: pickupCode ? { status, pickupCode } : { status } }),
  cancel: (storeId: string, orderId: string, reason: string) => apiRequest<StoreOrder>(L, `${base(storeId)}/${orderId}/cancel`, { method: 'POST', body: { reason } }),
};

/** Chaves do cache. Tudo do painel de pedidos fica sob `['lojista', 'orders', storeId]` para invalidar de uma vez. */
export const ordersKeys = {
  all: (storeId: string) => ['lojista', 'orders', storeId] as const,
  live: (storeId: string, scope: 'new' | 'in_progress') => ['lojista', 'orders', storeId, 'live', scope] as const,
  detail: (storeId: string, orderId: string) => ['lojista', 'orders', storeId, 'detail', orderId] as const,
  history: (storeId: string, number: string) => ['lojista', 'orders', storeId, 'history', number] as const,
};
