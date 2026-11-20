import { NextResponse, type NextRequest } from 'next/server';
import { clearedCookies, clearedPendingCookie, cookieNames, isSessionArea, writeCookies } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { areaAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { refreshSession } from '@/server/refresh';
import { callApi, clientHints } from '@/server/upstream';

/** Revoga a sessão na API e apaga os cookies. Sempre limpa os cookies, mesmo se a API estiver fora. */
export async function POST(request: NextRequest, context: { params: Promise<{ area: string }> }) {
  const { area } = await context.params;
  if (!isSessionArea(area)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (!areaAllowedOnHost(area, request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');

  const names = cookieNames(area);
  const hints = clientHints(request.headers);
  let token = request.cookies.get(names.access)?.value;
  // SEC-119: com o access vencido só o refresh sobrou; renova para conseguir revogar a sessão no servidor.
  const refresh = request.cookies.get(names.refresh)?.value;
  if (!token && refresh) token = (await refreshSession(refresh, hints).catch(() => null))?.accessToken;
  if (token) await callApi('/v1/auth/logout', { method: 'POST', accessToken: token, hints });

  const response = new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  writeCookies(response.cookies, area === 'admin' ? [...clearedCookies(area), clearedPendingCookie('mfa'), clearedPendingCookie('reset')] : clearedCookies(area));
  return response;
}
