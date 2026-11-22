/**
 * Catálogo de motivos das alterações do admin em loja (WB-351 C7, ADR-018 D6/D7, C-ADM-03). Regras PURAS (sem banco): o servidor valida; a tela só ajuda.
 * Os 8 códigos e as 4 exceções de preço espelham `AdminReasonCode` do contrato.
 */
export const ADMIN_REASON_CODES = ['requested_by_merchant', 'error_fix', 'moderation', 'operational_decision', 'other', 'obvious_price_error', 'legal_or_inspection_order', 'agreed_campaign'] as const;
export type AdminReasonCode = (typeof ADMIN_REASON_CODES)[number];
/** Para preço só valem estes (D7): o resto é decisão de operação, não de dinheiro do lojista. */
export const PRICE_REASON_CODES: readonly AdminReasonCode[] = ['requested_by_merchant', 'obvious_price_error', 'legal_or_inspection_order', 'agreed_campaign'];
/** Motivos que exigem a nota (canal e data, ou a explicação). */
const NOTE_REQUIRED: readonly AdminReasonCode[] = ['requested_by_merchant', 'other'];
export const REASON_NOTE_MAX = 200;

export interface AdminReason {
  code: AdminReasonCode;
  note?: string | undefined;
}

export type ReasonProblem = { code: 'REASON_REQUIRED' | 'REASON_NOT_ALLOWED'; field: string; message: string };

/** Texto puro: sem caractere de controle (nem quebra de linha) e sem espaços nas pontas. */
export function cleanNote(note: string | undefined): string | undefined {
  if (note === undefined) return undefined;
  // eslint-disable-next-line no-control-regex -- remover caractere de controle é o objetivo
  const text = note.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text === '' ? undefined : text;
}

/**
 * `flagOn` = `admin_edita_catalogo_sem_pedido` (J27, nasce DESLIGADA): desligada, só vale `requested_by_merchant` (o admin age a pedido do lojista).
 * `price` restringe aos 4 motivos de preço.
 */
export function validateAdminReason(reason: { code?: unknown; note?: unknown } | null | undefined, options: { flagOn: boolean; price?: boolean }): { ok: true; reason: AdminReason } | { ok: false; problem: ReasonProblem } {
  const code = reason?.code;
  if (typeof code !== 'string' || !(ADMIN_REASON_CODES as readonly string[]).includes(code)) {
    return { ok: false, problem: { code: 'REASON_REQUIRED', field: 'reason.code', message: 'Informe o motivo.' } };
  }
  const typed = code as AdminReasonCode;
  const note = cleanNote(typeof reason?.note === 'string' ? reason.note : undefined);
  if (note !== undefined && note.length > REASON_NOTE_MAX) return { ok: false, problem: { code: 'REASON_REQUIRED', field: 'reason.note', message: `A nota tem até ${REASON_NOTE_MAX} caracteres.` } };
  if (NOTE_REQUIRED.includes(typed) && note === undefined) {
    return { ok: false, problem: { code: 'REASON_REQUIRED', field: 'reason.note', message: typed === 'requested_by_merchant' ? 'Informe o canal e a data do pedido do lojista (ex.: WhatsApp, 24/11).' : 'Explique o motivo.' } };
  }
  if (options.price && !PRICE_REASON_CODES.includes(typed)) return { ok: false, problem: { code: 'REASON_NOT_ALLOWED', field: 'reason.code', message: 'Este motivo não vale para preço.' } };
  if (!options.flagOn && typed !== 'requested_by_merchant') {
    return { ok: false, problem: { code: 'REASON_NOT_ALLOWED', field: 'reason.code', message: 'Por enquanto a Webag só altera dados da loja a pedido do lojista.' } };
  }
  return { ok: true, reason: { code: typed, ...(note !== undefined ? { note } : {}) } };
}

/** Rótulo em português mostrado ao lojista (a nota do admin NÃO vai no aviso, só o motivo em texto; D10/J27). */
export const ADMIN_REASON_LABEL: Record<AdminReasonCode, string> = {
  requested_by_merchant: 'Solicitado pelo lojista',
  error_fix: 'Correção de erro',
  moderation: 'Moderação',
  operational_decision: 'Decisão operacional',
  other: 'Outro motivo',
  obvious_price_error: 'Erro evidente de preço',
  legal_or_inspection_order: 'Ordem de fiscalização ou do jurídico',
  agreed_campaign: 'Campanha acordada',
};
