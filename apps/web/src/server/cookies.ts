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
    // __Host-: sem Domain, só no host que gravou. Um subdomínio irmão não consegue sobrescrever (cookie tossing, SEC-116).
    refresh: `${COOKIE_SECURE ? '__Host-' : ''}wb_${area}_rt`,
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
  sameSite: 'lax' | 'strict';
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

/** Credenciais de 1 uso do login/reset do admin em 2 passos: ficam em cookie HttpOnly, nunca no JavaScript da página (SEC-115). */
export type PendingKind = 'mfa' | 'reset';
const PENDING_MAX_AGE_S: Record<PendingKind, number> = { mfa: 300, reset: 600 };

export function pendingCookieName(kind: PendingKind): string {
  return `${COOKIE_SECURE ? '__Host-' : ''}wb_admin_${kind}`;
}

export function pendingCookie(kind: PendingKind, value: string, expiresIn?: number): CookieSpec {
  const max = PENDING_MAX_AGE_S[kind];
  const ttl = expiresIn && expiresIn > 0 ? Math.min(expiresIn, max) : max;
  return { name: pendingCookieName(kind), value, httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', path: '/', maxAge: ttl };
}

export function clearedPendingCookie(kind: PendingKind): CookieSpec {
  return { ...pendingCookie(kind, ''), maxAge: 0 };
}

export interface CookieWriter {
  set(spec: CookieSpec): unknown;
}

export function writeCookies(target: CookieWriter, specs: CookieSpec[]): void {
  for (const spec of specs) target.set(spec);
}
