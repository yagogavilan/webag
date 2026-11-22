import { NextResponse, type NextRequest } from 'next/server';
import { writeCookies } from '@/server/cookies';
import { areaAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { parseJson } from '@/server/upstream';
import { VIEW_AS_COOKIE, VIEW_AS_READ_PATH, applySession, callAsAdmin, clearedViewAsCookie, readViewAsCookie } from '@/server/view-as';

/**
 * Leituras da visão (só GET, só as 13 rotas da lista fechada, só a loja da visão aberta). Põe o Bearer do admin e o `X-View-As` do cookie.
 * Falha de credencial (`VIEW_AS_EXPIRED`) apaga o cookie: a tela cai em "A visualização terminou".
 */
export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!areaAllowedOnHost('admin', request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  const { path } = await context.params;
  const joined = path.join('/');
  const match = VIEW_AS_READ_PATH.exec(joined);
  if (!match) return problem(404, 'NOT_FOUND', 'Não encontrado');
  const cookie = readViewAsCookie(request);
  // Sem visão aberta, ou de outra loja: o mesmo código que a API usa para credencial inválida, sem dizer qual parte falhou.
  if (!cookie || cookie.storeId.toLowerCase() !== match[1]!.toLowerCase()) {
    const response = problem(403, 'VIEW_AS_EXPIRED', 'A visualização terminou');
    if (request.cookies.has(VIEW_AS_COOKIE)) writeCookies(response.cookies, [clearedViewAsCookie()]);
    return response;
  }
  const call = await callAsAdmin(request, `/v1/${joined}`, { method: 'GET', query: request.nextUrl.search, viewAs: cookie.token });
  const { result } = call;
  const type = result.headers.get('content-type');
  const retry = result.headers.get('retry-after');
  const empty = result.status === 204 || result.text === '';
  const response = new NextResponse(empty ? null : result.text, { status: result.status, headers: { 'cache-control': 'no-store', ...(type ? { 'content-type': type } : {}), ...(retry ? { 'retry-after': retry } : {}) } });
  if (result.status === 403 && parseJson<{ code?: string }>(result.text)?.code === 'VIEW_AS_EXPIRED') writeCookies(response.cookies, [clearedViewAsCookie()]);
  applySession(response, call);
  return response;
}
