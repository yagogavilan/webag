/**
 * URL da API por ambiente. EXPO_PUBLIC_* é embutido no app (público): nunca colocar segredo aqui.
 * No emulador Android, `localhost` é o próprio emulador: use http://10.0.2.2:3000 (ver README do app).
 */
export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const REQUEST_TIMEOUT_MS = 15_000;
/** Renova o access token quando faltar menos que isso (evita 401 em rede lenta). */
export const REFRESH_SKEW_MS = 30_000;
