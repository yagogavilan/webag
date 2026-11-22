import { NextResponse, type NextRequest } from 'next/server';
import { writeCookies } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { areaAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { parseJson } from '@/server/upstream';
import { applySession, callAsAdmin, viewAsCookie } from '@/server/view-as';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODES = new Set(['merchant_support', 'investigate_issue', 'check_registration', 'other']);

interface Opened {
  id?: string;
  token?: string;
  storeId?: string;
  storeName?: string | null;
  expiresAt?: string;
}

/**
 * Abre "Ver como o lojista" (WB-352). Chama `openViewAs` com o Bearer do admin; a credencial `vas_` devolvida vai para o cookie
 * `httpOnly` e SAI do corpo: o JavaScript da página recebe só id, loja e o instante em que a visão termina.
 */
export async function POST(request: NextRequest) {
  if (!areaAllowedOnHost('admin', request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');
  const sent = parseJson<{ storeId?: unknown; reason?: { code?: unknown; note?: unknown } }>(await request.text());
  const code = sent?.reason?.code;
  if (typeof sent?.storeId !== 'string' || !UUID.test(sent.storeId) || typeof code !== 'string' || !CODES.has(code)) return problem(400, 'VALIDATION_ERROR', 'Pedido inválido');
  const note = typeof sent.reason?.note === 'string' ? sent.reason.note : undefined;
  // Só os campos conhecidos seguem para a API (o corpo do navegador não escolhe mais nada).
  const body = JSON.stringify({ reason: { code, ...(note !== undefined ? { note } : {}) } });

  const call = await callAsAdmin(request, `/v1/admin/stores/${sent.storeId}/view-as`, { method: 'POST', body });
  const { result } = call;
  const headers = { 'cache-control': 'no-store' };
  let response: NextResponse;
  if (result.status === 201) {
    const opened = parseJson<Opened>(result.text);
    const expiresAt = opened?.expiresAt ? Date.parse(opened.expiresAt) : NaN;
    if (!opened?.token || !opened.id || !opened.storeId || !Number.isFinite(expiresAt)) {
      response = problem(502, 'UPSTREAM_INVALID', 'Resposta inválida da API');
    } else {
      response = NextResponse.json({ id: opened.id, storeId: opened.storeId, storeName: opened.storeName ?? null, expiresAt: opened.expiresAt }, { status: 201, headers });
      writeCookies(response.cookies, [viewAsCookie({ token: opened.token, id: opened.id, storeId: opened.storeId, expiresAt, storeName: opened.storeName ?? null })]);
    }
  } else {
    const type = result.headers.get('content-type');
    const retry = result.headers.get('retry-after');
    response = new NextResponse(result.text || null, { status: result.status, headers: { ...headers, ...(type ? { 'content-type': type } : {}), ...(retry ? { 'retry-after': retry } : {}) } });
  }
  applySession(response, call);
  return response;
}
