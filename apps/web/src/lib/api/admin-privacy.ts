import type { PrivacyRequestDetail, PrivacyRequestItem, PrivacyRequestPage, PrivacyRequestRegister, PrivacyRequestRevealed, PrivacyRequestType } from '@webag/shared';
import { apiRequest } from './client';

/** Pedidos de titulares (LGPD, WB-217): só o super admin. Prazo de 15 dias; revelar o e-mail exige reautenticação, motivo e vai à auditoria. */
export type { PrivacyRequestDetail, PrivacyRequestItem, PrivacyRequestRevealed, PrivacyRequestType };
const A = 'admin' as const;

export const privacyApi = {
  list: (query: { status?: PrivacyRequestItem['status']; overdue?: boolean; cursor?: string } = {}) => apiRequest<PrivacyRequestPage>(A, 'admin/privacy-requests', { query: { status: query.status, overdue: query.overdue ? 'true' : undefined, cursor: query.cursor, limit: 50 } }),
  detail: (id: string) => apiRequest<PrivacyRequestDetail>(A, `admin/privacy-requests/${id}`),
  register: (body: PrivacyRequestRegister) => apiRequest<{ protocol: string; dueAt: string }>(A, 'admin/privacy-requests', { method: 'POST', body }),
  reveal: (id: string, reason: string) => apiRequest<PrivacyRequestRevealed>(A, `admin/privacy-requests/${id}/reveal`, { method: 'POST', body: { reason } }),
  inProgress: (id: string) => apiRequest<PrivacyRequestDetail>(A, `admin/privacy-requests/${id}/in-progress`, { method: 'POST' }),
  answer: (id: string, answer: string) => apiRequest<PrivacyRequestDetail>(A, `admin/privacy-requests/${id}/answer`, { method: 'POST', body: { answer } }),
};

export const privacyKeys = {
  list: (filter: string) => ['admin', 'privacy', 'list', filter] as const,
  all: ['admin', 'privacy'] as const,
  detail: (id: string) => ['admin', 'privacy', 'detail', id] as const,
};

export const REQUEST_TYPE_LABEL: Record<PrivacyRequestType, string> = {
  access: 'Quer saber que dados temos',
  correction: 'Quer corrigir um dado',
  deletion: 'Quer apagar os dados',
  portability: 'Quer levar os dados',
  objection: 'Não concorda com um uso',
  other: 'Outro',
};
export const REQUEST_STATUS_LABEL: Record<PrivacyRequestItem['status'], string> = { new: 'Nova', in_progress: 'Em andamento', answered: 'Respondida' };
export const CHANNEL_LABEL: Record<PrivacyRequestItem['channel'], string> = { form: 'Formulário do app', email: 'E-mail', app: 'App' };

/** "Vence em 5 dias", "Vence hoje", "Atrasado há 2 dias": sempre em texto (nunca só cor). */
export function deadlineText(item: Pick<PrivacyRequestItem, 'daysLeft' | 'overdue' | 'status'>): string {
  if (item.status === 'answered') return 'Respondida';
  if (item.overdue || item.daysLeft < 0) return `Atrasado há ${Math.abs(item.daysLeft)} ${Math.abs(item.daysLeft) === 1 ? 'dia' : 'dias'}`;
  if (item.daysLeft === 0) return 'Vence hoje';
  return `Vence em ${item.daysLeft} ${item.daysLeft === 1 ? 'dia' : 'dias'}`;
}
