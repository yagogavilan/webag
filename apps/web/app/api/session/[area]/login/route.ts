import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Me } from '@/lib/session-types';
import { isSessionArea, writeCookies, sessionCookies, type TokenPair } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { problem } from '@/server/http';
import { callApi, clientHints, parseJson } from '@/server/upstream';

const bodySchema = z.strictObject({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(1000),
  totpCode: z.string().trim().min(6).max(32).optional(),
  /** Código enviado por e-mail quando a conta teve muitas falhas (SEC-004). */
  code: z.string().trim().regex(/^\d{6}$/).optional(),
});

interface LoginResponse {
  tokens: TokenPair;
  mfaSetupRequired: boolean;
}

const INVALID = () => problem(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 'E-mail ou senha incorretos.');

/**
 * Login do painel. Os tokens ficam em cookie HttpOnly; o corpo da resposta só diz o que o navegador precisa saber.
 * Quem não pode abrir a área (admin no painel do lojista, não-admin no admin) recebe a MESMA mensagem de senha errada e a
 * sessão recém-criada é revogada (WB-100 C4, SEC-106).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ area: string }> }) {
  const { area } = await context.params;
  if (!isSessionArea(area)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  const csrf = csrfProblem(request);
  if (csrf) return problem(403, 'CSRF', 'Requisição recusada');

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, 'VALIDATION_FAILED', 'Dados inválidos');

  const hints = clientHints(request.headers);
  const login = await callApi('/v1/auth/login', { method: 'POST', body: JSON.stringify(parsed.data), hints });
  if (login.status !== 200) {
    // Repassa o problem+json da API (códigos TOTP_REQUIRED, INVALID_CREDENTIALS, ACCOUNT_BLOCKED, RATE_LIMITED...).
    const headers = new Headers({ 'content-type': 'application/problem+json', 'cache-control': 'no-store' });
    const retry = login.headers.get('retry-after');
    if (retry) headers.set('retry-after', retry);
    return new NextResponse(login.text || null, { status: login.status, headers });
  }

  const body = parseJson<LoginResponse>(login.text);
  if (!body) return problem(502, 'BAD_UPSTREAM', 'Resposta inesperada da API');

  if (!body.mfaSetupRequired) {
    const me = await callApi('/v1/me', { accessToken: body.tokens.accessToken, hints });
    const user = parseJson<Me>(me.text);
    // Lojista: cliente sem loja também entra (vê "Você ainda não tem uma loja", onda-1b E7); credencial de admin, não.
    const allowed = user && (area === 'admin' ? user.adminProfile !== null : user.adminProfile === null);
    if (!allowed) {
      await callApi('/v1/auth/logout', { method: 'POST', accessToken: body.tokens.accessToken, hints });
      return INVALID();
    }
  }

  const response = NextResponse.json({ mfaSetupRequired: body.mfaSetupRequired }, { headers: { 'cache-control': 'no-store' } });
  writeCookies(response.cookies, sessionCookies(area, body.tokens));
  return response;
}
