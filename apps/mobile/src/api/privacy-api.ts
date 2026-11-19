import {
  cancelAccountDeletion,
  createDataExportDownloadLink,
  deleteAccount,
  getAccountDeletion,
  getHelp,
  getMyConsents,
  getMyDataExport,
  markPushCampaignOpened,
  reportContent,
  requestDataExport,
  setMyConsent,
  type ContentReportRequest,
} from '@webag/shared';
import { request } from './http';

/** Privacidade, ajuda e denúncia (Onda 6, WB-211 a 217, WB-034, WB-038). Confirmação de ação sensível é só a senha (DEC-015). */

export type ConsentPurpose = 'marketing_push' | 'marketing_email' | 'precise_location' | 'waitlist';

export const fetchDeletionOverview = (signal?: AbortSignal) => request((init) => getAccountDeletion(init), { retry: true, ...(signal ? { signal } : {}) });

/** Sem `retry`: excluir é irreversível e a senha errada conta no limite; nunca repetimos sozinhos. */
export const removeMyAccount = (password: string) => request((init) => deleteAccount({ password }, init));

/**
 * Arrependimento: rota pública (e-mail e senha), igual ao login. Sob ataque o servidor responde 403 `LOGIN_CODE_REQUIRED` e envia um
 * código ao e-mail: repetir com `code` conclui (SEC-176). Repetir SEM `code` é o reenvio.
 */
export const cancelMyDeletion = (email: string, password: string, code?: string) =>
  request((init) => cancelAccountDeletion({ email: email.trim().toLowerCase(), password, ...(code ? { code } : {}) }, init), { auth: 'none' });

export const fetchDataExport = (signal?: AbortSignal) => request((init) => getMyDataExport(init), { retry: true, ...(signal ? { signal } : {}) });
export const askDataExport = (password: string) => request((init) => requestDataExport({ password }, init));
export const exportDownloadLink = (exportId: string) => request((init) => createDataExportDownloadLink(exportId, init));

export const fetchConsents = (signal?: AbortSignal) => request((init) => getMyConsents(init), { retry: true, ...(signal ? { signal } : {}) });
export const changeConsent = (purpose: ConsentPurpose, granted: boolean) => request((init) => setMyConsent(purpose, { granted }, init), { retry: true });

export const fetchHelp = (signal?: AbortSignal) => request((init) => getHelp(undefined, init), { auth: 'none', retry: true, ...(signal ? { signal } : {}) });

/** 202 sempre, também na repetição: a tela diz a mesma frase. */
export const sendReport = (body: ContentReportRequest) => request((init) => reportContent(body, init));

/** Abertura de push de campanha (`POST /v1/me/push-campaigns/{id}/opened`): mede o resultado sem dado pessoal. Falha em silêncio. */
export async function reportPushOpened(campaignId: string): Promise<void> {
  try {
    await request((init) => markPushCampaignOpened(campaignId, init), { timeoutMs: 5_000 });
  } catch {
    // medição não pode atrapalhar a abertura do app
  }
}
