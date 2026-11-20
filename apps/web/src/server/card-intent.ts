import 'server-only';
import type { CardIntentView } from '@webag/shared';
import { callApi, clientHints, parseJson } from './upstream';

/** Formato do token de intenção (a API também confere; aqui só evita chamada à toa com lixo na URL). */
export const CARD_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

export type IntentLoad = { ok: true; view: CardIntentView } | { ok: false; reason: 'invalid' | 'busy' | 'unavailable' };

/** Lê a intenção para montar o formulário (sem login; a credencial é o token). Não consome a intenção. */
export async function loadCardIntent(token: string | undefined, headers: Headers): Promise<IntentLoad> {
  if (!token || !CARD_TOKEN.test(token)) return { ok: false, reason: 'invalid' };
  const result = await callApi(`/v1/card-intents/${token}`, { hints: clientHints(headers) });
  if (result.status === 200) {
    const view = parseJson<CardIntentView>(result.text);
    if (view) return { ok: true, view };
    return { ok: false, reason: 'unavailable' };
  }
  if (result.status === 410 || result.status === 404 || result.status === 400) return { ok: false, reason: 'invalid' };
  if (result.status === 429) return { ok: false, reason: 'busy' };
  return { ok: false, reason: 'unavailable' };
}
