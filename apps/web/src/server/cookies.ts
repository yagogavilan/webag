import 'server-only';
import { COOKIE_SECURE, REFRESH_COOKIE_MAX_AGE_S } from './config';

export type SessionArea = 'admin' | 'lojista';

export function isSessionArea(value: string): value is SessionArea {
  return value === 'admin' || value === 'lojista';
}

/** Um par de cookies por área: a sessão do admin nunca vale no painel do lojista (SEC-106). */
export function cookieNames(area: SessionArea) {
  return {
    access: `${COOKIE_SECURE ? '__Host-' : ''}wb_${area}_at`,
    refresh: `${COOKIE_SECURE ? '__Secure-' : ''}wb_${area}_rt`,
  };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Segundos de validade do access token. */
  expiresIn: number;
}

interface CookieSpec {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/** HttpOnly + SameSite=Lax (ADR-003). O JavaScript da página nunca enxerga os tokens. */
export function sessionCookies(area: SessionArea, tokens: TokenPair): CookieSpec[] {
  const names = cookieNames(area);
  const base = { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/' } as const;
  return [
    { ...base, name: names.access, value: tokens.accessToken, maxAge: Math.max(tokens.expiresIn - 5, 1) },
    { ...base, name: names.refresh, value: tokens.refreshToken, maxAge: REFRESH_COOKIE_MAX_AGE_S },
  ];
}

export function clearedCookies(area: SessionArea): CookieSpec[] {
  const names = cookieNames(area);
  const base = { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/', value: '', maxAge: 0 } as const;
  return [
    { ...base, name: names.access },
    { ...base, name: names.refresh },
  ];
}

export interface CookieWriter {
  set(spec: CookieSpec): unknown;
}

export function writeCookies(target: CookieWriter, specs: CookieSpec[]): void {
  for (const spec of specs) target.set(spec);
}
