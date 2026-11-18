import { NextResponse, type NextRequest } from 'next/server';
import { clearedCookies, cookieNames, isSessionArea, writeCookies } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { problem } from '@/server/http';
import { callApi, clientHints } from '@/server/upstream';

/** Revoga a sessão na API e apaga os cookies. Sempre limpa os cookies, mesmo se a API estiver fora. */
export async function POST(request: NextRequest, context: { params: Promise<{ area: string }> }) {
  const { area } = await context.params;
  if (!isSessionArea(area)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');

  const token = request.cookies.get(cookieNames(area).access)?.value;
  if (token) await callApi('/v1/auth/logout', { method: 'POST', accessToken: token, hints: clientHints(request.headers) });

  const response = new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  writeCookies(response.cookies, clearedCookies(area));
  return response;
}
