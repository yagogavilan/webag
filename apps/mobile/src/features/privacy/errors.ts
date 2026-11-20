import { ApiError } from '../../api/problem';
import { t } from '../../i18n';

export type PasswordActionError =
  | { kind: 'password'; message: string }
  | { kind: 'rate'; message: string }
  | { kind: 'email-unverified'; message: string }
  | { kind: 'blocked' }
  | { kind: 'busy'; message: string }
  | { kind: 'limit'; retryAfter: number | undefined; message: string }
  | { kind: 'offline'; message: string }
  | { kind: 'other'; message: string };

/** Erro de ação confirmada por senha (exportar, excluir): a tela decide a mensagem pelo `code`, nunca pelo texto do servidor. */
export function toPasswordActionError(error: unknown): PasswordActionError {
  if (!(error instanceof ApiError)) return { kind: 'other', message: t('privacy.cantNow') };
  if (error.isConnectivity) return { kind: 'offline', message: t('privacy.offlineAction') };
  switch (error.code) {
    case 'INVALID_PASSWORD':
      return { kind: 'password', message: t('privacy.passwordWrong') };
    case 'EMAIL_VERIFICATION_REQUIRED':
      return { kind: 'email-unverified', message: t('privacy.exportEmailNeeded') };
    case 'DELETION_BLOCKED':
      return { kind: 'blocked' };
    case 'EXPORT_IN_PROGRESS':
      return { kind: 'busy', message: t('privacy.exportBusy') };
    case 'EXPORT_DAILY_LIMIT':
      return { kind: 'limit', retryAfter: error.retryAfter, message: t('privacy.exportLimit', { when: 'amanhã' }) };
    default:
      if (error.status === 429) return { kind: 'rate', message: t('privacy.tooMany') };
      return { kind: 'other', message: t('privacy.cantNow') };
  }
}
