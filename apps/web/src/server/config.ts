import 'server-only';

/** URL interna da API. Só existe no servidor do web: o navegador nunca fala direto com a API (BFF, ver SEC-106). */
export const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const IS_PROD = process.env.NODE_ENV === 'production';

/** Cookies `Secure` (e prefixos `__Host-`/`__Secure-`). Desligar só em HTTP local de teste. */
export const COOKIE_SECURE = (process.env.COOKIE_SECURE ?? String(IS_PROD)) === 'true';

/** Tempo de vida do cookie de refresh (ADR-003: 30 dias deslizantes). */
export const REFRESH_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;
