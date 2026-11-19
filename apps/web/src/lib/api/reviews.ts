import type { StoreReview, StoreReviewPage } from '@webag/shared';
import { apiRequest } from './client';

/** Avaliações no painel da loja (WB-195, permissão da loja `reviews`): lista com a resposta pública, responder, editar e apagar. */
export type { StoreReview, StoreReviewPage };
export const REPLY_MAX = 500;

const L = 'lojista' as const;
export interface ReviewFilter {
  replied?: boolean;
  rating?: number;
}

export const reviewsApi = {
  list: (storeId: string, filter: ReviewFilter = {}, cursor?: string) => apiRequest<StoreReviewPage>(L, `stores/${storeId}/reviews`, { query: { replied: filter.replied === undefined ? undefined : String(filter.replied), rating: filter.rating, cursor, limit: 20 } }),
  reply: (storeId: string, reviewId: string, text: string) => apiRequest<{ id: string; storeReply: string; storeRepliedAt: string }>(L, `stores/${storeId}/reviews/${reviewId}/reply`, { method: 'PUT', body: { text } }),
  removeReply: (storeId: string, reviewId: string) => apiRequest<void>(L, `stores/${storeId}/reviews/${reviewId}/reply`, { method: 'DELETE' }),
};

export const reviewsKeys = {
  all: (storeId: string) => ['lojista', 'reviews', storeId] as const,
  list: (storeId: string, filter: ReviewFilter) => ['lojista', 'reviews', storeId, filter.replied ?? 'all', filter.rating ?? 'all'] as const,
};
