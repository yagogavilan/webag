import { t } from '../../i18n';
import { ApiError } from '../../api/problem';

export type CodeFailure = 'invalid' | 'expired' | 'rate' | 'network' | 'other';

/** Classifica falha de código de e-mail pelo `code` estável da API (nunca pelo texto). */
export function classifyCodeError(error: unknown): CodeFailure {
  if (!(error instanceof ApiError)) return 'other';
  if (error.isConnectivity || error.kind === 'server') return 'network';
  if (error.code === 'CODE_INVALID') return 'invalid';
  if (error.code === 'CODE_EXPIRED') return 'expired';
  if (error.status === 429 || error.code === 'RATE_LIMITED') return 'rate';
  return 'other';
}

/** Mensagem de campo de senha para 422 WEAK_PASSWORD: o servidor manda o motivo em pt-BR; sem ele, a frase fixa do design. */
export function weakPasswordMessage(error: ApiError): string {
  const fromField = error.fields.find((f) => f.field === 'password' || f.field === 'newPassword')?.message;
  return fromField ?? error.detail ?? t('password.tooCommon');
}
