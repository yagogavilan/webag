import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { sessionCookies, writeCookies, type TokenPair } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { problem } from '@/server/http';
import { callApi, clientHints, parseJson } from '@/server/upstream';

const bodySchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().min(3).max(254),
  phone: z.string().trim().min(10).max(20),
  password: z.string().min(1).max(128),
  adultDeclaration: z.literal(true),
  acceptedDocuments: z.array(z.strictObject({ type: z.enum(['customer_terms', 'merchant_terms', 'privacy']), version: z.number().int().min(1) })).min(1).max(5),
});

/**
 * Cadastro do lojista (L1): cria a conta (a API já abre a sessão) e guarda os tokens em cookie HttpOnly.
 * Só existe para o painel do lojista: o admin nasce por convite (WB-101), nunca por cadastro aberto.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ area: string }> }) {
  const { area } = await context.params;
  if (area !== 'lojista') return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, 'VALIDATION_FAILED', 'Dados inválidos');

  const result = await callApi('/v1/auth/register', { method: 'POST', body: JSON.stringify(parsed.data), hints: clientHints(request.headers) });
  if (result.status !== 201 && result.status !== 200) {
    const headers = new Headers({ 'content-type': 'application/problem+json', 'cache-control': 'no-store' });
    const retry = result.headers.get('retry-after');
    if (retry) headers.set('retry-after', retry);
    return new NextResponse(result.text || null, { status: result.status, headers });
  }
  const body = parseJson<{ tokens: TokenPair; user: { emailVerified: boolean } }>(result.text);
  if (!body) return problem(502, 'BAD_UPSTREAM', 'Resposta inesperada da API');

  const response = NextResponse.json({ emailVerified: body.user.emailVerified }, { status: 201, headers: { 'cache-control': 'no-store' } });
  writeCookies(response.cookies, sessionCookies('lojista', body.tokens));
  return response;
}
