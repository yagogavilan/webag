import type { Exchange, ExchangePage } from '@webag/shared';
import { apiRequest } from './client';

/** Trocas na loja (Onda 5B, WB-172 a 175). A Webag cuida da coleta; a loja decide e confere o item. */
export type { Exchange, ExchangePage };
export type ExchangeScope = 'pending' | 'in_progress' | 'history';

const L = 'lojista' as const;
const base = (storeId: string) => `stores/${storeId}/exchanges`;

export const exchangesApi = {
  list: (storeId: string, query: { scope?: ExchangeScope; cursor?: string; limit?: number } = {}) => apiRequest<ExchangePage>(L, base(storeId), { query: { ...query } }),
  get: (storeId: string, id: string) => apiRequest<Exchange>(L, `${base(storeId)}/${id}`),
  accept: (storeId: string, id: string) => apiRequest<Exchange>(L, `${base(storeId)}/${id}/accept`, { method: 'POST' }),
  refuse: (storeId: string, id: string, reason: string) => apiRequest<Exchange>(L, `${base(storeId)}/${id}/refuse`, { method: 'POST', body: { reason } }),
  receive: (storeId: string, id: string, body: { ok: boolean; reason?: string; returnToStock?: boolean; code?: string }) => apiRequest<Exchange>(L, `${base(storeId)}/${id}/receive`, { method: 'POST', body }),
};

export const exchangesKeys = {
  all: (storeId: string) => ['lojista', 'exchanges', storeId] as const,
  list: (storeId: string, scope: ExchangeScope) => ['lojista', 'exchanges', storeId, 'list', scope] as const,
  pending: (storeId: string) => ['lojista', 'exchanges', storeId, 'list', 'pending'] as const,
  detail: (storeId: string, id: string) => ['lojista', 'exchanges', storeId, 'detail', id] as const,
};

/** Quanto tempo falta para a loja responder; `null` se já passou. */
export function answerRemainingMs(exchange: Pick<Exchange, 'answerDeadlineAt'>, now: number): number {
  return Date.parse(exchange.answerDeadlineAt) - now;
}

export type DeadlineTone = 'normal' | 'warning' | 'urgent' | 'late';
/** Normal acima de 8 h, atenção até 8 h, urgente até 2 h (TL1). Sempre com texto, nunca só cor. */
export function deadlineTone(ms: number): DeadlineTone {
  if (ms <= 0) return 'late';
  if (ms <= 2 * 3_600_000) return 'urgent';
  if (ms <= 8 * 3_600_000) return 'warning';
  return 'normal';
}

export function formatDeadline(ms: number): string {
  if (ms <= 0) return 'Prazo encerrado';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `Responda em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `Responda em ${hours} h`;
}

export const EXCHANGE_TYPE_LABEL: Record<Exchange['type'], string> = { withdrawal: 'Desistência', defect: 'Defeito', size_color: 'Tamanho ou cor' };
export const EXCHANGE_STATUS_LABEL: Record<Exchange['status'], string> = {
  requested: 'Aguardando você',
  awaiting_fee: 'Aguardando a taxa do cliente',
  approved: 'Aprovada',
  item_received: 'Item recebido',
  completed: 'Concluída',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
  in_mediation: 'Em mediação do Webag',
};
