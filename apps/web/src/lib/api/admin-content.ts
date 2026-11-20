import type { ContentReportCase, ContentReportOutcome, ContentReportQueue, HelpContacts, HelpContactsPatch, HelpFaq, HelpFaqCreate, HelpFaqList } from '@webag/shared';
import { apiRequest } from './client';

/** Moderação de denúncias (DN2, WB-124) e conteúdo da ajuda (AJ3, WB-034). */
export type { ContentReportCase, ContentReportOutcome, ContentReportQueue, HelpContacts, HelpFaq };
const A = 'admin' as const;
export type ReportTarget = 'review' | 'product' | 'store';
export type RemoveReasonCode = 'offense' | 'personal_data' | 'illegal' | 'spam';

export const contentApi = {
  queue: (targetType: ReportTarget) => apiRequest<ContentReportQueue>(A, 'admin/content-reports', { query: { targetType, status: 'open', limit: 50 } }),
  case: (targetType: ReportTarget, targetId: string) => apiRequest<ContentReportCase>(A, `admin/content-reports/${targetType}/${targetId}`),
  keep: (targetType: ReportTarget, targetId: string, note?: string) => apiRequest<ContentReportOutcome>(A, `admin/content-reports/${targetType}/${targetId}/keep`, { method: 'POST', body: note ? { note } : {} }),
  removeReview: (targetId: string, reasonCode: RemoveReasonCode, note?: string) => apiRequest<ContentReportOutcome>(A, `admin/content-reports/review/${targetId}/remove`, { method: 'POST', body: { reasonCode, ...(note ? { note } : {}) } }),
  forward: (targetType: 'product' | 'store', targetId: string) => apiRequest<ContentReportOutcome>(A, `admin/content-reports/${targetType}/${targetId}/forward`, { method: 'POST', body: {} }),
  faqs: () => apiRequest<HelpFaqList>(A, 'admin/help/faqs'),
  createFaq: (body: HelpFaqCreate) => apiRequest<HelpFaq>(A, 'admin/help/faqs', { method: 'POST', body }),
  updateFaq: (id: string, body: { group?: string; question?: string; answer?: string; published?: boolean }) => apiRequest<HelpFaq>(A, `admin/help/faqs/${id}`, { method: 'PATCH', body }),
  deleteFaq: (id: string) => apiRequest<void>(A, `admin/help/faqs/${id}`, { method: 'DELETE' }),
  reorderFaqs: (audience: HelpFaq['audience'], group: string, ids: string[]) => apiRequest<HelpFaqList>(A, 'admin/help/faqs/reorder', { method: 'POST', body: { audience, group, ids } }),
  contacts: () => apiRequest<HelpContacts>(A, 'admin/help/contacts'),
  saveContacts: (body: HelpContactsPatch) => apiRequest<HelpContacts>(A, 'admin/help/contacts', { method: 'PUT', body }),
};

export const contentKeys = {
  queue: (t: ReportTarget) => ['admin', 'content-reports', 'queue', t] as const,
  all: ['admin', 'content-reports'] as const,
  case: (t: ReportTarget, id: string) => ['admin', 'content-reports', 'case', t, id] as const,
  faqs: ['admin', 'help', 'faqs'] as const,
  contacts: ['admin', 'help', 'contacts'] as const,
};

export const REPORT_REASON_LABEL: Record<string, string> = { offensive: 'Ofensivo', false: 'Falso', prohibited: 'Produto proibido', scam: 'Golpe', other: 'Outro' };
export const REMOVE_REASONS: { id: RemoveReasonCode; label: string }[] = [
  { id: 'offense', label: 'Ofensa' },
  { id: 'personal_data', label: 'Dado pessoal' },
  { id: 'illegal', label: 'Conteúdo ilegal' },
  { id: 'spam', label: 'Spam' },
];
export const FAQ_GROUPS: Record<HelpFaq['audience'], { id: string; label: string }[]> = {
  customer: [{ id: 'order', label: 'Pedido' }, { id: 'payment', label: 'Pagamento' }, { id: 'exchange', label: 'Troca' }, { id: 'account', label: 'Conta' }],
  merchant: [{ id: 'orders', label: 'Pedidos' }, { id: 'products', label: 'Produtos' }, { id: 'exchanges', label: 'Trocas' }, { id: 'money', label: 'Dinheiro' }, { id: 'team', label: 'Equipe' }],
};
