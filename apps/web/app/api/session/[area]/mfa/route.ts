import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Me } from '@/lib/session-types';
import { clearedPendingCookie, pendingCookieName, sessionCookies, writeCookies, type TokenPair } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { areaAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { callApi, clientHints, parseJson } from '@/server/upstream';

const bodySchema = z.strictObject({
  /** TOTP de 6 dígitos ou código de recuperação. */
  code: z.string().trim().min(6).max(32),
});

interface VerifyResponse {
  tokens?: TokenPair;
  mfaSetupRequired?: boolean;
}

/**
 * 2º passo do login do admin (SEC-115, SEC-090): o `mfaToken` vem do cookie HttpOnly gravado pelo login, nunca do corpo.
 * Código errado, token vencido ou usado: a API responde igual (401 `MFA_INVALID`) e o cookie fica até acabar as tentativas.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ area: string }> }) {
  const { area } = await context.params;
  if (area !== 'admin') return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (!areaAllowedOnHost(area, request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (csrfProblem(request)) return problem(403, 'CSRF', 'Requisição recusada');

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, 'VALIDATION_FAILED', 'Dados inválidos');

  const mfaToken = request.cookies.get(pendingCookieName('mfa'))?.value;
  if (!mfaToken) return problem(401, 'MFA_INVALID', 'Código incorreto ou vencido', 'Código incorreto ou vencido.');

  const hints = clientHints(request.headers);
  const verify = await callApi('/v1/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ mfaToken, code: parsed.data.code }), hints });
  if (verify.status !== 200) {
    const headers = new Headers({ 'content-type': 'application/problem+json', 'cache-control': 'no-store' });
    const retry = verify.headers.get('retry-after');
    if (retry) headers.set('retry-after', retry);
    const failed = new NextResponse(verify.text || null, { status: verify.status, headers });
    // Token gasto (uso único) ou conta sem acesso: não adianta guardar o cookie.
    if (verify.status === 403) writeCookies(failed.cookies, [clearedPendingCookie('mfa')]);
    return failed;
  }

  const body = parseJson<VerifyResponse>(verify.text);
  if (!body?.tokens) return problem(502, 'BAD_UPSTREAM', 'Resposta inesperada da API');
  const mfaSetupRequired = body.mfaSetupRequired === true;

  if (!mfaSetupRequired) {
    const me = await callApi('/v1/me', { accessToken: body.tokens.accessToken, hints });
    const user = parseJson<Me>(me.text);
    if (!user || user.adminProfile === null) {
      await callApi('/v1/auth/logout', { method: 'POST', accessToken: body.tokens.accessToken, hints });
      return problem(401, 'MFA_INVALID', 'Código incorreto ou vencido', 'Código incorreto ou vencido.');
    }
  }

  const response = NextResponse.json({ mfaSetupRequired }, { headers: { 'cache-control': 'no-store' } });
  writeCookies(response.cookies, [...sessionCookies('admin', body.tokens), clearedPendingCookie('mfa')]);
  return response;
}
