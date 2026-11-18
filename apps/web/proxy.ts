import { NextResponse, type NextRequest } from 'next/server';
import { cookieNames, sessionCookies } from '@/server/cookies';
import { refreshSession } from '@/server/refresh';

/**
 * Proxy (antigo middleware) do painel admin:
 * 1. CSP com nonce e demais cabeçalhos de segurança;
 * 2. renova o access token (cookie de 15 min) usando o refresh antes de renderizar;
 * 3. sem sessão, manda para o login. É só conveniência: a API autoriza de verdade.
 */
const { access: AT, refresh: RT } = cookieNames('admin');

const PUBLIC_ADMIN_PATHS = ['/admin/entrar', '/admin/convite', '/admin/esqueci-a-senha'];

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', policy);

  let refreshed: ReturnType<typeof sessionCookies> = [];
  let hasSession = Boolean(request.cookies.get(AT)?.value);
  const refreshToken = request.cookies.get(RT)?.value;

  if (!hasSession && refreshToken) {
    const pair = await refreshSession(refreshToken, {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent'),
      deviceId: null,
    });
    if (pair) {
      refreshed = sessionCookies('admin', pair);
      hasSession = true;
      const merged = request.cookies
        .getAll()
        .filter((c) => c.name !== AT && c.name !== RT)
        .map((c) => `${c.name}=${c.value}`);
      for (const c of refreshed) merged.push(`${c.name}=${c.value}`);
      requestHeaders.set('cookie', merged.join('; '));
    }
  }

  const isPublic = PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  let response: NextResponse;
  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/entrar';
    url.search = '';
    if (pathname !== '/admin') url.searchParams.set('next', `${pathname}${search}`);
    response = NextResponse.redirect(url);
    if (refreshToken) {
      // Refresh recusado: limpa para não tentar de novo a cada requisição.
      response.cookies.set({ name: RT, value: '', maxAge: 0, path: '/' });
    }
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  for (const c of refreshed) response.cookies.set(c);
  response.headers.set('content-security-policy', policy);
  response.headers.set('cache-control', 'no-store');
  return response;
}

export const config = { matcher: ['/admin/:path*'] };
