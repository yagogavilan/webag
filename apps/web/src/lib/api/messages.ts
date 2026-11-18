import { ApiError, isServerFailure } from './errors';

export const AUDIT_FAILURE = 'Não foi possível registrar na auditoria. Por segurança, nada foi alterado.';

/**
 * Mensagem de erro de uma ação de escrita. Falha do servidor vira o texto de "falha fechada" (WB-123 C4): a auditoria
 * é gravada na mesma transação, então um 5xx significa que NADA mudou.
 */
export function saveErrorMessage(error: unknown, fallback = 'Não foi possível salvar. O que você digitou continua aqui.'): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return 'Conecte-se para salvar. O que você digitou continua aqui.';
    if (isServerFailure(error)) return AUDIT_FAILURE;
    if (error.status === 403) return 'Você não tem permissão para esta ação.';
    if (error.status === 429) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    if (error.status === 401) return 'Sua sessão terminou. Entre de novo para continuar.';
  }
  return fallback;
}
