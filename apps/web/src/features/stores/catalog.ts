import type { AdminStoreDetail, CorrectionItem, DocumentAccessReason } from '@/lib/api/admin-stores';
import type { DocumentKind, StoreStatus } from '@/lib/api/lojista';

export const STATUS_LABEL: Record<StoreStatus, string> = {
  draft: 'Cadastro em andamento',
  in_review: 'Em análise',
  correction_requested: 'Aguardando lojista',
  approved: 'Aprovada',
  live: 'No ar',
  rejected: 'Recusada',
  suspended: 'Suspensa',
};

export const DOCUMENT_NAME: Record<DocumentKind, string> = {
  id_front: 'Documento, frente',
  id_back: 'Documento, verso',
  address_proof: 'Comprovante de endereço',
  cnpj_card: 'Cartão CNPJ',
  responsible_id: 'Documento do responsável',
};

/** Os 6 itens da checklist de aprovação (onda-2 A2). `target`: onde o lojista corrige quando o item tem problema. */
export const CHECKLIST = [
  { id: 'legible', label: 'Documento legível', target: 'document' },
  { id: 'document', label: 'CPF/CNPJ confere com o documento e está ativo', target: 'store_data' },
  { id: 'address', label: 'Endereço da loja confere', target: 'store_data' },
  { id: 'category', label: 'Categoria adequada', target: 'store_data' },
  { id: 'contact', label: 'Nome e WhatsApp válidos', target: 'store_data' },
  { id: 'duplicate', label: 'Loja sem duplicidade', target: 'store_data' },
] as const;
export type CheckId = (typeof CHECKLIST)[number]['id'];
export type CheckValue = 'ok' | 'problem';
export interface CheckState {
  value: CheckValue | null;
  note: string;
  /** Só para "Documento legível": qual documento tem o problema. */
  doc?: DocumentKind | undefined;
}
export type Checks = Record<CheckId, CheckState>;

export const EMPTY_CHECKS: Checks = Object.fromEntries(CHECKLIST.map((item) => [item.id, { value: null, note: '' }])) as Checks;

export const checkedCount = (checks: Checks): number => CHECKLIST.filter((item) => checks[item.id].value !== null).length;
export const allOk = (checks: Checks): boolean => CHECKLIST.every((item) => checks[item.id].value === 'ok');
export const problems = (checks: Checks) => CHECKLIST.filter((item) => checks[item.id].value === 'problem');
/** Problema sem texto não vai ao lojista: o admin precisa dizer o que está errado (mínimo 3, regra da API). */
export const problemsWithoutNote = (checks: Checks) => problems(checks).filter((item) => checks[item.id].note.trim().length < 3);

/** Junta os itens com problema por destino (documento ou dados da loja): a API aceita um motivo por item. */
export function buildCorrectionItems(checks: Checks, documents: AdminStoreDetail['documents']): CorrectionItem[] {
  const byTarget = new Map<string, string[]>();
  for (const item of problems(checks)) {
    const state = checks[item.id];
    const target = item.target === 'document' ? (state.doc ?? documents.find((d) => d.current)?.kind ?? 'store_data') : 'store_data';
    byTarget.set(target, [...(byTarget.get(target) ?? []), state.note.trim()]);
  }
  return [...byTarget.entries()].map(([item, notes]) => ({ item, reason: notes.join(' ').slice(0, 500) }));
}

export const REJECT_REASONS = ['Documento inválido', 'Dados não conferem', 'Loja duplicada', 'Atividade não permitida'] as const;
export const SUSPEND_REASONS = ['Denúncias de clientes', 'Produto proibido', 'Dados falsos', 'Pedido da justiça'] as const;

export const ACCESS_REASON_FOR: Record<'in_review' | 'other', DocumentAccessReason> = { in_review: 'initial_review', other: 'doubt' };

export function maskPhone(value: string | null): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  return digits.length < 4 ? '••••' : `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskDocument(value: string): string {
  const digits = value.replace(/\D/g, '');
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskEmail(value: string): string {
  const [user = '', domain = ''] = value.split('@');
  return `${user.slice(0, 1)}•••@${domain}`;
}

/** "há 1 d 4 h", "há 3 h", "há 12 min". */
export function sinceLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `há ${days} d ${hours} h` : `há ${days} d`;
  if (hours > 0) return `há ${hours} h`;
  return `há ${Math.max(1, minutes)} min`;
}
