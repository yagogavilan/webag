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
};
