import { NextResponse, type NextRequest } from 'next/server';
import { clearedCookies, clearedPendingCookie, cookieNames, pendingCookie, pendingCookieName, isSessionArea, sessionCookies, writeCookies, type SessionArea, type TokenPair } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { areaAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { refreshSession } from '@/server/refresh';
import { callApi, clientHints, parseJson, type UpstreamResult } from '@/server/upstream';

/**
 * Proxy da API para o navegador (BFF). Põe o Bearer a partir do cookie HttpOnly, renova uma vez em 401 e só
 * deixa passar o que cada área usa. A autorização de verdade é da API.
 */
const ALLOWED: Record<SessionArea, RegExp> = {
  admin: /^(admin\/.+|me(\/.*)?|auth\/(reauth|logout-all|password\/(forgot|reset(\/complete)?))|legal\/[a-z_]+)$/,
  lojista:
    /^(me(\/.*)?|auth\/(reauth|logout-all|password\/(forgot|reset)|email\/(verify|resend|correct))|legal\/[a-z_]+|regions|categories|config\/flags|waitlist|cep\/\d{8}|uploads(\/[0-9a-f-]{36}(\/complete)?)?|stores(\/[A-Za-z0-9_-]{1,40}){0,5})$/,
};
/** Rotas cuja resposta traz tokens novos (a API revoga a sessão anterior): viram cookie e saem do corpo. */
const ROTATES_TOKENS = new Set(['me/password', 'auth/password/reset']);
/** Rotas que encerram a sessão atual. */
const ENDS_SESSION = new Set(['auth/logout-all']);

async function handle(request: NextRequest, context: { params: Promise<{ area: string; path: string[] }> }) {
  const { area, path } = await context.params;
  if (!isSessionArea(area)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (!areaAllowedOnHost(area, request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  const joined = path.join('/');
  if (path.some((s) => s === '..' || s === '.' || s === '') || !ALLOWED[area].test(joined)) {
    return problem(404, 'NOT_FOUND', 'Não encontrado');
  }
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');

  const names = cookieNames(area);
  const hints = clientHints(request.headers);
  let body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  const completesReset = area === 'admin' && joined === 'auth/password/reset/complete';
  if (completesReset) {
    // SEC-115/095: o `resetTicket` vive em cookie HttpOnly; o navegador manda só TOTP/recuperação e a senha nova.
    const ticket = request.cookies.get(pendingCookieName('reset'))?.value;
    const sent = parseJson<{ totpCode?: unknown; newPassword?: unknown }>(body ?? '');
    if (!ticket || !sent) return problem(401, 'MFA_INVALID', 'Código incorreto ou vencido', 'Código incorreto ou vencido.');
    body = JSON.stringify({ resetTicket: ticket, totpCode: sent.totpCode, newPassword: sent.newPassword });
  }
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
  if (!completesReset && result.status === 401 && refresh && !renewed && (await renew())) result = await send();

  // Reset de senha do admin com TOTP: a API devolve `resetTicket`; ele vai para cookie e sai do corpo (SEC-095).
  if (area === 'admin' && joined === 'auth/password/reset' && result.status === 200) {
    const ticket = parseJson<{ resetTicket?: string; expiresIn?: number }>(result.text);
    if (ticket?.resetTicket) {
      const pending = NextResponse.json({ mfaRequired: true }, { headers: { 'cache-control': 'no-store' } });
      writeCookies(pending.cookies, [pendingCookie('reset', ticket.resetTicket, ticket.expiresIn)]);
      return pending;
    }
  }

  const response = respond(result);
  if (completesReset && result.status < 400) writeCookies(response.cookies, [clearedPendingCookie('reset')]);
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
