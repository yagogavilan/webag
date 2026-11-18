import { NextResponse, type NextRequest } from 'next/server';
import { clearedCookies, cookieNames, sessionCookies } from '@/server/cookies';
import { refreshSession } from '@/server/refresh';
import { areaAllowedOnHost } from '@/server/hosts';
import { clientHints } from '@/server/upstream';

/**
 * Proxy (antigo middleware) dos painéis admin e lojista (cada área com o seu par de cookies, SEC-106):
 * 1. CSP com nonce e demais cabeçalhos de segurança;
 * 2. renova o access token (cookie de 15 min) usando o refresh antes de renderizar;
 * 3. sem sessão, manda para o login. É só conveniência: a API autoriza de verdade.
 */
type Area = 'admin' | 'lojista';

const PUBLIC_PATHS: Record<Area, string[]> = {
  admin: ['/admin/entrar', '/admin/convite', '/admin/esqueci-a-senha'],
  lojista: ['/lojista/entrar', '/lojista/cadastro', '/lojista/convite', '/lojista/esqueci-a-senha'],
};

/** Origem do armazenamento de objetos (upload direto com POST pré-assinado e documentos por URL assinada, ADR-005). */
function storageOrigin(): string {
  const raw = process.env.STORAGE_ORIGIN?.trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV !== 'production';
  const storage = storageOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${storage ? ` ${storage}` : ''}`,
    "font-src 'self'",
    `connect-src 'self'${storage ? ` ${storage}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const area: Area = pathname === '/lojista' || pathname.startsWith('/lojista/') ? 'lojista' : 'admin';
  const { access: AT, refresh: RT } = cookieNames(area);
  const home = `/${area}`;
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);

  // SEC-116: cada painel só responde no seu host.
  if (!areaAllowedOnHost(area, request.headers)) {
    return new NextResponse('Não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', policy);

  let refreshed: ReturnType<typeof sessionCookies> = [];
  let hasSession = Boolean(request.cookies.get(AT)?.value);
  const refreshToken = request.cookies.get(RT)?.value;

  if (!hasSession && refreshToken) {
    const pair = await refreshSession(refreshToken, { ...clientHints(request.headers), deviceId: null });
    if (pair) {
      refreshed = sessionCookies(area, pair);
      hasSession = true;
      const merged = request.cookies
        .getAll()
        .filter((c) => c.name !== AT && c.name !== RT)
        .map((c) => `${c.name}=${c.value}`);
      for (const c of refreshed) merged.push(`${c.name}=${c.value}`);
      requestHeaders.set('cookie', merged.join('; '));
    }
  }

  const isPublic = PUBLIC_PATHS[area].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  let response: NextResponse;
  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = `${home}/entrar`;
    url.search = '';
    if (pathname !== home) url.searchParams.set('next', `${pathname}${search}`);
    response = NextResponse.redirect(url);
    if (refreshToken) {
      // Refresh recusado: limpa para não tentar de novo a cada requisição.
      for (const c of clearedCookies(area)) if (c.name === RT) response.cookies.set(c);
    }
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  for (const c of refreshed) response.cookies.set(c);
  response.headers.set('content-security-policy', policy);
  response.headers.set('cache-control', 'no-store');
  return response;
}

export const config = { matcher: ['/admin/:path*', '/lojista/:path*'] };
