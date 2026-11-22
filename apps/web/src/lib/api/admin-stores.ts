import type { AdminPauseStoreRequest, AdminResumeStoreRequest, AdminStoreEditResult, AdminStoreHistoryPage, AdminStoreOverview, AdminStoreProfileEditRequest, StoreHistoryType } from '@webag/shared';
import { apiRequest } from './client';
import type { Page } from './admin';
import type { DocumentKind, StoreStatus } from './lojista';

/**
 * Fila e decisões de lojas no admin (Onda 2A). Espelha `apps/api/src/modules/stores/admin-stores.controller.ts`;
 * lacunas de contrato em `docs/arquitetura/pendencias-contrato-web-admin.md`.
 */
export interface QueueRow {
  id: string;
  name: string | null;
  status: StoreStatus;
  /** CPF/CNPJ já mascarado pela API. */
  documentMasked: string;
  city: string | null;
  submittedAt: string | null;
  overdue: boolean;
  holderMismatch: boolean;
  /** v1.1 R1 (WB-350): só vêm com `status=all` ou nas listas novas; opcionais para a fila antiga. */
  activeProducts?: number;
  orders30d?: number;
  sales30dCents?: number;
  commissionPct?: number;
  commissionSource?: 'store' | 'category' | 'default';
}

export type { AdminPauseStoreRequest, AdminResumeStoreRequest, AdminStoreEditResult, AdminStoreHistoryPage, AdminStoreOverview, AdminStoreProfileEditRequest, StoreHistoryType };

export interface StoreListParams {
  status: StoreStatus | 'all';
  q?: string;
  noActiveProduct?: boolean;
  ownCommission?: boolean;
  cursor?: string;
}

export interface AdminStoreAddress {
  cep: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
}

export interface AdminStoreCore {
  id: string;
  status: StoreStatus;
  documentType: 'cpf' | 'cnpj';
  document: string;
  legalName: string | null;
  name: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  mainCategoryId: string | null;
  address: AdminStoreAddress | null;
  logo: unknown;
  cover: unknown;
  pendingReview: boolean;
  submittedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
}

export interface AdminStoreDocument {
  id: string;
  kind: DocumentKind;
  uploadedAt: string;
  current: boolean;
}

export interface AdminStoreDetail {
  store: AdminStoreCore;
  owner: { email: string; name: string };
  documents: AdminStoreDocument[];
  reviewItems: { item: string; reason: string }[];
  history: { from: StoreStatus | null; to: StoreStatus; at: string; reason: string | null }[];
  paymentAccount: { status: string; holderDocumentMasked: string; holderMatchesStore: boolean } | null;
  sameDocument: { id: string; status: StoreStatus }[];
}

export type DocumentAccessReason = 'initial_review' | 'doubt' | 'report';

export interface DocumentAccess {
  /** URL assinada de poucos minutos. */
  url: string;
  expiresInSeconds: number;
  contentType: string;
}

export interface CorrectionItem {
  /** `store_data` ou o tipo do documento. */
  item: string;
  reason: string;
}

const A = 'admin' as const;

export const adminStoresApi = {
  queue: (status: 'in_review' | 'correction_requested', cursor?: string) => apiRequest<Page<QueueRow>>(A, 'admin/stores', { query: { status, cursor, limit: 50 } }),
  list: (status: StoreStatus, cursor?: string) => apiRequest<Page<QueueRow>>(A, 'admin/stores', { query: { status, cursor, limit: 50 } }),
  /** WB-350 C1/C3: lista com busca e atalhos (`status=all`, `q`, `noActiveProduct`, `ownCommission`). */
  search: (params: StoreListParams) =>
    apiRequest<Page<QueueRow>>(A, 'admin/stores', { query: { status: params.status, q: params.q || undefined, noActiveProduct: params.noActiveProduct ? 'true' : undefined, ownCommission: params.ownCommission ? 'true' : undefined, cursor: params.cursor, limit: 50 } }),
  /** WB-350: ficha 360 (uma chamada). `store.version` é o `expectedVersion` das edições. */
  overview: (storeId: string) => apiRequest<AdminStoreOverview>(A, `admin/stores/${storeId}/overview`),
  history: (storeId: string, type: StoreHistoryType | undefined, cursor?: string) => apiRequest<AdminStoreHistoryPage>(A, `admin/stores/${storeId}/history`, { query: { type, cursor, limit: 25 } }),
  editProfile: (storeId: string, body: AdminStoreProfileEditRequest) => apiRequest<AdminStoreEditResult>(A, `admin/stores/${storeId}/profile`, { method: 'PATCH', body }),
  pause: (storeId: string, body: AdminPauseStoreRequest) => apiRequest<AdminStoreEditResult>(A, `admin/stores/${storeId}/pause`, { method: 'POST', body }),
  resume: (storeId: string, body: AdminResumeStoreRequest) => apiRequest<AdminStoreEditResult>(A, `admin/stores/${storeId}/resume`, { method: 'POST', body }),
  detail: (storeId: string) => apiRequest<AdminStoreDetail>(A, `admin/stores/${storeId}`),
  documentAccess: (storeId: string, documentId: string, reason: DocumentAccessReason) => apiRequest<DocumentAccess>(A, `admin/stores/${storeId}/documents/${documentId}/access`, { method: 'POST', body: { reason } }),
  approve: (storeId: string) => apiRequest<AdminStoreCore>(A, `admin/stores/${storeId}/approve`, { method: 'POST' }),
  requestCorrection: (storeId: string, items: CorrectionItem[]) => apiRequest<AdminStoreCore>(A, `admin/stores/${storeId}/request-correction`, { method: 'POST', body: { items } }),
  reject: (storeId: string, reason: string) => apiRequest<AdminStoreCore>(A, `admin/stores/${storeId}/reject`, { method: 'POST', body: { reason } }),
  suspend: (storeId: string, reason: string) => apiRequest<AdminStoreCore>(A, `admin/stores/${storeId}/suspend`, { method: 'POST', body: { reason } }),
  reactivate: (storeId: string) => apiRequest<AdminStoreCore>(A, `admin/stores/${storeId}/reactivate`, { method: 'POST' }),
};

export const storeKeys = {
  queue: (status: string) => ['admin', 'stores', 'queue', status] as const,
  all: ['admin', 'stores'] as const,
  detail: (id: string) => ['admin', 'stores', 'detail', id] as const,
  overview: (id: string) => ['admin', 'stores', 'overview', id] as const,
  history: (id: string, type: string) => ['admin', 'stores', 'history', id, type] as const,
  search: (params: object) => ['admin', 'stores', 'search', params] as const,
};
