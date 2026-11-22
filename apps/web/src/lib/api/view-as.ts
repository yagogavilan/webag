import type { ExchangePageViewAs, GetStoreReviewsSummary200, ProductPage, StoreOrderPage, StoreOrderViewAs, StoreReviewPage, StoreSettingsViewAs, StoreViewAs, ViewAsReasonCode } from '@webag/shared';
import { viewAsRequest } from './client';

/**
 * "Ver como o lojista" (WB-352, ADR-018 D8). Os tipos `...ViewAs` vêm do contrato e SÃO os usados na tela: `Store` e `StoreOrder` mentem
 * na visão (trazem campos que a API não envia ali). A credencial `vas_` nunca passa por aqui: ela mora em cookie `httpOnly` do BFF.
 */
export type { ExchangePageViewAs, StoreOrderViewAs, StoreSettingsViewAs, StoreViewAs, ViewAsReasonCode };
export type ViewAsOrderPage = StoreOrderPage;
export type ViewAsProductPage = ProductPage;
export type ViewAsReviewPage = StoreReviewPage;
export type ViewAsReviewsSummary = GetStoreReviewsSummary200;

export interface ViewAsState {
  active: boolean;
  id?: string;
  storeId?: string;
  storeName?: string | null;
  /** ISO. Absoluto: não desliza com o uso e não renova. */
  expiresAt?: string;
}

export interface ViewAsOpened {
  id: string;
  storeId: string;
  storeName: string | null;
  expiresAt: string;
}

export const VIEW_AS_REASON_LABEL: Record<ViewAsReasonCode, string> = {
  merchant_support: 'Suporte ao lojista por telefone',
  investigate_issue: 'Investigar um problema',
  check_registration: 'Conferir o cadastro',
  other: 'Outro',
};

export const viewAsApi = {
  open: (storeId: string, reason: { code: ViewAsReasonCode; note?: string }) => viewAsRequest<ViewAsOpened>('open', { method: 'POST', body: { storeId, reason } }),
  state: () => viewAsRequest<ViewAsState>('session'),
  end: () => viewAsRequest<void>('end', { method: 'POST' }),
  store: (storeId: string) => viewAsRequest<StoreViewAs>(`read/stores/${storeId}`),
  settings: (storeId: string) => viewAsRequest<StoreSettingsViewAs>(`read/stores/${storeId}/settings`),
  orders: (storeId: string, cursor?: string) => viewAsRequest<ViewAsOrderPage>(`read/stores/${storeId}/orders`, { query: { cursor, limit: 25 } }),
  order: (storeId: string, orderId: string) => viewAsRequest<StoreOrderViewAs>(`read/stores/${storeId}/orders/${orderId}`),
  products: (storeId: string, cursor?: string) => viewAsRequest<ViewAsProductPage>(`read/stores/${storeId}/products`, { query: { cursor, limit: 25 } }),
  exchanges: (storeId: string, cursor?: string) => viewAsRequest<ExchangePageViewAs>(`read/stores/${storeId}/exchanges`, { query: { cursor, limit: 25 } }),
  reviewsSummary: (storeId: string) => viewAsRequest<ViewAsReviewsSummary>(`read/stores/${storeId}/reviews/summary`),
  reviews: (storeId: string, cursor?: string) => viewAsRequest<ViewAsReviewPage>(`read/stores/${storeId}/reviews`, { query: { cursor, limit: 25 } }),
};

export const viewAsKeys = {
  all: ['admin', 'view-as'] as const,
  state: ['admin', 'view-as', 'state'] as const,
  scope: (storeId: string) => ['admin', 'view-as', 'read', storeId] as const,
  read: (storeId: string, ...parts: (string | undefined)[]) => ['admin', 'view-as', 'read', storeId, ...parts] as const,
};
