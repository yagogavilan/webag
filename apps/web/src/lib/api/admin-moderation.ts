import { apiRequest } from './client';
import type { Page } from './admin';

/**
 * Moderação de produtos (A4, WB-107). CONTRATO PROVISÓRIO: a API de catálogo e moderação ainda não existe (sub-onda 2B);
 * o formato abaixo é a proposta do web em `docs/arquitetura/pendencias-contrato-web-admin.md` (#13). A tela fica fora do
 * menu enquanto `MODERATION_READY` for falso.
 */
export const MODERATION_READY = false;

export type ModerationTab = 'review' | 'reported' | 'all';
export type ModerationStatus = 'flagged' | 'reported' | 'active' | 'paused' | 'removed';

export interface ModerationRow {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
  category: string;
  priceCents: number;
  createdAt: string;
  /** Motivo do sinal: "Palavra proibida: réplica", "Denúncia: produto proibido". */
  signal: string | null;
  reports: number;
  status: ModerationStatus;
  photoUrl: string | null;
  description: string | null;
  /** Remoções da loja nos últimos 30 dias (reincidência). */
  storeRemovals30d: number;
}

export interface ModerationRules {
  words: { id: string; value: string }[];
  categories: { id: string; name: string }[];
}

const A = 'admin' as const;

export const moderationApi = {
  list: (tab: ModerationTab, cursor?: string) => apiRequest<Page<ModerationRow> & { counts: { review: number; reported: number } }>(A, 'admin/moderation/products', { query: { tab, cursor, limit: 50 } }),
  keep: (id: string) => apiRequest<void>(A, `admin/moderation/products/${id}/keep`, { method: 'POST' }),
  pause: (id: string, reason: string) => apiRequest<void>(A, `admin/moderation/products/${id}/pause`, { method: 'POST', body: { reason } }),
  remove: (id: string, reason: string) => apiRequest<void>(A, `admin/moderation/products/${id}/remove`, { method: 'POST', body: { reason } }),
  rules: () => apiRequest<ModerationRules>(A, 'admin/moderation/rules'),
  addWord: (value: string) => apiRequest<{ id: string; value: string }>(A, 'admin/moderation/rules/words', { method: 'POST', body: { value } }),
  removeWord: (id: string) => apiRequest<void>(A, `admin/moderation/rules/words/${id}`, { method: 'DELETE' }),
  addCategory: (categoryId: string) => apiRequest<void>(A, 'admin/moderation/rules/categories', { method: 'POST', body: { categoryId } }),
  removeCategory: (id: string) => apiRequest<void>(A, `admin/moderation/rules/categories/${id}`, { method: 'DELETE' }),
};

export const moderationKeys = {
  list: (tab: ModerationTab) => ['admin', 'moderation', 'list', tab] as const,
  all: ['admin', 'moderation'] as const,
  rules: ['admin', 'moderation', 'rules'] as const,
};
