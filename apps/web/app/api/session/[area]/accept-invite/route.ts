import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSessionArea, sessionCookies, writeCookies, type TokenPair } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { problem } from '@/server/http';
import { callApi, clientHints, parseJson } from '@/server/upstream';

const bodySchema = z.strictObject({ token: z.string().min(20).max(200), password: z.string().min(1).max(1000) });

/** Aceitar convite de admin cria a senha e abre uma sessão sem 2º fator: o painel só libera a configuração do TOTP. */
export async function POST(request: NextRequest, context: { params: Promise<{ area: string }> }) {
  const { area } = await context.params;
  if (area !== 'admin' || !isSessionArea(area)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, 'VALIDATION_FAILED', 'Dados inválidos');

  const result = await callApi('/v1/auth/invitations/accept', { method: 'POST', body: JSON.stringify(parsed.data), hints: clientHints(request.headers) });
  if (result.status !== 200) {
    return new NextResponse(result.text || null, { status: result.status, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } });
  }
  const body = parseJson<{ tokens: TokenPair }>(result.text);
  if (!body) return problem(502, 'BAD_UPSTREAM', 'Resposta inesperada da API');
  const response = NextResponse.json({ mfaSetupRequired: true }, { headers: { 'cache-control': 'no-store' } });
  writeCookies(response.cookies, sessionCookies(area, body.tokens));
  return response;
}
