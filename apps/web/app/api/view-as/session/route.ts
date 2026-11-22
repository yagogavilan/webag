import { NextResponse, type NextRequest } from 'next/server';
import { writeCookies } from '@/server/cookies';
import { areaAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { VIEW_AS_COOKIE, clearedViewAsCookie, readViewAsCookie } from '@/server/view-as';

/** Estado da visão aberta, SEM a credencial: o que a tela precisa para o banner e o relógio. Não chama a API. */
export async function GET(request: NextRequest) {
  if (!areaAllowedOnHost('admin', request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  const cookie = readViewAsCookie(request);
  const response = NextResponse.json(cookie ? { active: true, id: cookie.id, storeId: cookie.storeId, storeName: cookie.storeName, expiresAt: new Date(cookie.expiresAt).toISOString() } : { active: false }, { headers: { 'cache-control': 'no-store' } });
  // Cookie vencido ou malformado: apaga (o navegador já o teria descartado pelo Max-Age; isto cobre o malformado).
  if (!cookie && request.cookies.has(VIEW_AS_COOKIE)) writeCookies(response.cookies, [clearedViewAsCookie()]);
  return response;
}
