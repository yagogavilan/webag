import { NextResponse, type NextRequest } from 'next/server';
import { writeCookies } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { areaAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { applySession, callAsAdmin, clearedViewAsCookie, readViewAsCookie } from '@/server/view-as';

/** "Sair da visualização": invalida a credencial na API e apaga o cookie, mesmo se a API estiver fora (a validade de 30 min corre de qualquer forma). */
export async function POST(request: NextRequest) {
  if (!areaAllowedOnHost('admin', request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');
  const cookie = readViewAsCookie(request);
  const call = cookie ? await callAsAdmin(request, `/v1/admin/view-as/${cookie.id}/end`, { method: 'POST' }) : null;
  const response = new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  writeCookies(response.cookies, [clearedViewAsCookie()]);
  if (call) applySession(response, call);
  return response;
}
