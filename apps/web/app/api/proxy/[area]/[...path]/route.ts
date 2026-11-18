import { NextResponse, type NextRequest } from 'next/server';
import { clearedCookies, cookieNames, isSessionArea, sessionCookies, writeCookies, type SessionArea, type TokenPair } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { problem } from '@/server/http';
import { refreshSession } from '@/server/refresh';
import { callApi, clientHints, parseJson, type UpstreamResult } from '@/server/upstream';

/**
 * Proxy da API para o navegador (BFF). Põe o Bearer a partir do cookie HttpOnly, renova uma vez em 401 e só
 * deixa passar o que cada área usa. A autorização de verdade é da API.
 */
const ALLOWED: Record<SessionArea, RegExp> = {
  admin: /^(admin\/.+|me(\/.*)?|auth\/(reauth|logout-all|password\/(forgot|reset))|legal\/[a-z_]+)$/,
  lojista:
    /^(me(\/.*)?|auth\/(reauth|logout-all|password\/(forgot|reset)|email\/(verify|resend|correct))|legal\/[a-z_]+|regions|categories|config\/flags|waitlist|geo\/cep\/\d{8}|uploads(\/[0-9a-f-]{36}\/complete)?|store-invitations\/[A-Za-z0-9_-]{20,200})$/,
};
/** Rotas cuja resposta traz tokens novos (a API revoga a sessão anterior): viram cookie e saem do corpo. */
const ROTATES_TOKENS = new Set(['me/password', 'auth/password/reset']);
/** Rotas que encerram a sessão atual. */
const ENDS_SESSION = new Set(['auth/logout-all']);

async function handle(request: NextRequest, context: { params: Promise<{ area: string; path: string[] }> }) {
  const { area, path } = await context.params;
  if (!isSessionArea(area)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  const joined = path.join('/');
  if (path.some((s) => s === '..' || s === '.' || s === '') || !ALLOWED[area].test(joined)) {
    return problem(404, 'NOT_FOUND', 'Não encontrado');
  }
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');

  const names = cookieNames(area);
  const hints = clientHints(request.headers);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  const query = request.nextUrl.search;

  let access = request.cookies.get(names.access)?.value ?? null;
  const refresh = request.cookies.get(names.refresh)?.value ?? null;
  let renewed: TokenPair | null = null;

  const send = () => callApi(`/v1/${joined}`, { method: request.method, accessToken: access, body, hints, query });
  const renew = async (): Promise<boolean> => {
    if (!refresh) return false;
    renewed = await refreshSession(refresh, hints);
    if (renewed) access = renewed.accessToken;
    return renewed !== null;
  };

  if (!access) await renew();
  let result: UpstreamResult = await send();
  if (result.status === 401 && refresh && !renewed && (await renew())) result = await send();

  const response = respond(result);
  if (renewed) writeCookies(response.cookies, sessionCookies(area, renewed));
  if (result.status === 401 && !renewed && refresh) writeCookies(response.cookies, clearedCookies(area));
  if (result.status < 400 && ENDS_SESSION.has(joined)) writeCookies(response.cookies, clearedCookies(area));
  // Redefinir senha só abre sessão para o lojista; o admin sempre passa pelo 2º fator (SEC-095).
  if (result.status < 400 && ROTATES_TOKENS.has(joined) && (joined !== 'auth/password/reset' || area === 'lojista')) {
    const tokens = parseJson<{ tokens?: TokenPair }>(result.text)?.tokens;
    if (tokens) {
      writeCookies(response.cookies, sessionCookies(area, tokens));
      return withCookies(NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } }), response);
    }
  }
  return response;
}

function respond(result: UpstreamResult): NextResponse {
  const headers = new Headers({ 'cache-control': 'no-store' });
  const type = result.headers.get('content-type');
  if (type) headers.set('content-type', type);
  const retry = result.headers.get('retry-after');
  if (retry) headers.set('retry-after', retry);
  const empty = result.status === 204 || result.text === '';
  return new NextResponse(empty ? null : result.text, { status: result.status, headers });
}

function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
