import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { COOKIE_SECURE } from './config';
import { clearedCookies, cookieNames, sessionCookies, writeCookies, type CookieSpec, type TokenPair } from './cookies';
import { refreshSession } from './refresh';
import { callApi, clientHints, type UpstreamInit, type UpstreamResult } from './upstream';

/**
 * "Ver como o lojista" no BFF (ADR-018 D8, threat model §14.5). A credencial `vas_` vive só num cookie `httpOnly`, `SameSite=Strict`,
 * `__Host-` (sem `Domain`, `Path=/`, `Secure`) e validade até `expiresAt`; o JavaScript da página nunca a lê, e ela não vai para URL,
 * `localStorage`, corpo nem log. A API ainda exige o Bearer do MESMO admin e da MESMA sessão: roubar só o cookie não serve.
 * SEC-219: `__Host-` impede um host irmão de plantar o cookie. Como o `Path=/` faz o navegador mandá-lo a todas as rotas, só as 4
 * rotas de `app/api/view-as` o leem (e só com a sessão do admin presente); o proxy comum e o resto do BFF nunca o repassam.
 */
export const VIEW_AS_COOKIE = `${COOKIE_SECURE ? '__Host-' : ''}wb_admin_vas`;

const TOKEN = /^vas_[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ViewAsCookie {
  token: string;
  id: string;
  storeId: string;
  /** Epoch em ms. */
  expiresAt: number;
  /** Nome da loja, só para o banner (vai codificado no cookie). */
  storeName: string | null;
}

/** O valor guarda os metadados da visão ao lado da credencial para a tela saber o relógio sem pedir nada à API. */
export function encodeViewAsCookie(value: ViewAsCookie): string {
  return `${value.token}|${value.id}|${value.storeId}|${value.expiresAt}|${encodeURIComponent((value.storeName ?? '').slice(0, 120))}`;
}

/** Há cookie de sessão do admin (access ou refresh)? Sem ele a visão não existe: o cookie sozinho (de outra sessão ou plantado) não vale. */
export function hasAdminSession(request: NextRequest): boolean {
  const names = cookieNames('admin');
  return Boolean(request.cookies.get(names.access)?.value || request.cookies.get(names.refresh)?.value);
}

export function readViewAsCookie(request: NextRequest, now = Date.now()): ViewAsCookie | null {
  if (!hasAdminSession(request)) return null;
  const raw = request.cookies.get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  const [token, id, storeId, expires, name] = raw.split('|');
  const expiresAt = Number(expires);
  if (!token || !TOKEN.test(token) || !id || !UUID.test(id) || !storeId || !UUID.test(storeId) || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
  let storeName: string | null = null;
  try {
    storeName = name ? decodeURIComponent(name) : null;
  } catch {
    storeName = null;
  }
  return { token, id, storeId, expiresAt, storeName };
}

export function viewAsCookie(value: ViewAsCookie, now = Date.now()): CookieSpec {
  return { name: VIEW_AS_COOKIE, value: encodeViewAsCookie(value), httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', path: '/', maxAge: Math.max(Math.floor((value.expiresAt - now) / 1000), 1) };
}

export function clearedViewAsCookie(): CookieSpec {
  return { name: VIEW_AS_COOKIE, value: '', httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', path: '/', maxAge: 0 };
}

/** Rotas de LEITURA que aceitam a credencial (as 13 `x-view-as: true` do contrato, mais a lista fechada do BFF). Qualquer outra: 404 aqui. */
const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const VIEW_AS_READ_PATH = new RegExp(
  `^stores/(${UUID_PART})(?:/(?:settings|products|products/${UUID_PART}|sections|products/table|orders|orders/counts|orders/${UUID_PART}|exchanges|exchanges/${UUID_PART}|reviews/summary|reviews))?$`,
  'i',
);

export interface AdminCallResult {
  result: UpstreamResult;
  /** Tokens novos quando o access estava vencido: a rota grava os cookies da sessão. */
  renewed: TokenPair | null;
  /** O refresh também falhou: a sessão do admin acabou. */
  sessionLost: boolean;
}

/** Chamada à API como o admin logado (Bearer do cookie, com renovação em 401), opcionalmente com a credencial da visão. */
export async function callAsAdmin(request: NextRequest, path: string, init: Omit<UpstreamInit, 'accessToken' | 'hints'> = {}): Promise<AdminCallResult> {
  const names = cookieNames('admin');
  const hints = clientHints(request.headers);
  let access = request.cookies.get(names.access)?.value ?? null;
  const refresh = request.cookies.get(names.refresh)?.value ?? null;
  let renewed: TokenPair | null = null;
  const renew = async (): Promise<boolean> => {
    if (!refresh) return false;
    renewed = await refreshSession(refresh, hints);
    if (renewed) access = renewed.accessToken;
    return renewed !== null;
  };
  if (!access) await renew();
  let result = await callApi(path, { ...init, accessToken: access, hints });
  if (result.status === 401 && refresh && !renewed && (await renew())) result = await callApi(path, { ...init, accessToken: access, hints });
  return { result, renewed, sessionLost: result.status === 401 && Boolean(refresh) && !renewed };
}

/** Aplica ao response os cookies de sessão renovados ou apagados (mesma regra do proxy). */
export function applySession(response: NextResponse, call: AdminCallResult): void {
  if (call.renewed) writeCookies(response.cookies, sessionCookies('admin', call.renewed));
  if (call.sessionLost) writeCookies(response.cookies, [...clearedCookies('admin'), clearedViewAsCookie()]);
}
