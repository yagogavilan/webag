import type { AdminProduct, AdminProductPage, ModerationResult, ModerationTerm } from '@webag/shared';
import { apiRequest } from './client';

/**
 * Moderação de produtos (A4, WB-107). Contrato real do `openapi.yaml` (`/v1/admin/products` e `/v1/admin/moderation/terms`):
 * os tipos vêm do cliente gerado em `@webag/shared`.
 *
 * Diferenças para a spec A4 (registradas em `pendencias-contrato-web-admin.md`): a API não tem "denúncias" (sem aba
 * "Denunciados" nem contagem por produto), não devolve foto do produto nem a contagem de remoções da loja (o aviso de
 * reincidência vem em `storeFlagged` ao remover) e "Manter no ar" é a ação `restore`.
 */
export type { AdminProduct, ModerationResult, ModerationTerm };
export type ModerationStatus = AdminProduct['moderationStatus'];
export type ModerationTab = 'review' | 'paused' | 'removed' | 'all';
export type ModerationAction = 'pause' | 'remove' | 'restore';

const A = 'admin' as const;

export const moderationApi = {
  list: (tab: ModerationTab, cursor?: string, limit = 50) =>
    apiRequest<AdminProductPage>(A, 'admin/products', { query: { moderationStatus: tab === 'all' ? undefined : tab, cursor, limit } }),
  /** `reason` é obrigatório para pausar e remover (5 a 500 caracteres); o lojista recebe o motivo por e-mail. */
  act: (id: string, action: ModerationAction, reason?: string) =>
    apiRequest<ModerationResult>(A, `admin/products/${id}/moderation`, { method: 'POST', body: reason === undefined ? { action } : { action, reason } }),
  terms: () => apiRequest<{ data: ModerationTerm[]; nextCursor: null }>(A, 'admin/moderation/terms'),
  addTerm: (kind: ModerationTerm['kind'], value: string) => apiRequest<ModerationTerm>(A, 'admin/moderation/terms', { method: 'POST', body: { kind, value } }),
  removeTerm: (id: string) => apiRequest<void>(A, `admin/moderation/terms/${id}`, { method: 'DELETE' }),
};

export const moderationKeys = {
  list: (tab: ModerationTab) => ['admin', 'moderation', 'list', tab] as const,
  reviewCount: ['admin', 'moderation', 'review-count'] as const,
  all: ['admin', 'moderation'] as const,
  terms: ['admin', 'moderation', 'terms'] as const,
};

export const TAB_LABEL: Record<ModerationTab, string> = { review: 'Revisar', paused: 'Pausados', removed: 'Removidos', all: 'Todos' };

export const STATUS_LABEL: Record<ModerationStatus, string> = { ok: 'No ar', review: 'Em revisão', paused: 'Pausado', removed: 'Removido' };
