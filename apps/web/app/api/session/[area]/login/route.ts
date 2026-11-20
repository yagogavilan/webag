import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Me } from '@/lib/session-types';
import { clearedPendingCookie, isSessionArea, pendingCookie, writeCookies, sessionCookies, type TokenPair } from '@/server/cookies';
import { csrfProblem } from '@/server/csrf';
import { areaAllowedOnHost } from '@/server/hosts';
import { problem } from '@/server/http';
import { callApi, clientHints, parseJson } from '@/server/upstream';

const bodySchema = z.strictObject({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(1000),
  /** Código enviado por e-mail quando a conta teve muitas falhas (SEC-004). */
  code: z.string().trim().regex(/^\d{6}$/).optional(),
});

/** Resposta do `/v1/auth/login`: sessão aberta, ou desafio do 2º fator (admin com TOTP, SEC-090). */
interface LoginResponse {
  tokens?: TokenPair;
  mfaSetupRequired?: boolean;
  mfaRequired?: boolean;
  mfaToken?: string;
  expiresIn?: number;
}

const INVALID = () => problem(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', 'E-mail ou senha incorretos.');

/**
 * Login do painel em 2 passos para admin com TOTP (SEC-115): a senha certa devolve `{ mfaRequired: true }` e o `mfaToken`
 * fica em cookie HttpOnly de 5 min; o código segue para `/api/session/admin/mfa`. Os tokens ficam em cookie HttpOnly; o corpo da resposta só diz o que o navegador precisa saber.
 * Quem não pode abrir a área (admin no painel do lojista, não-admin no admin) recebe a MESMA mensagem de senha errada e a
 * sessão recém-criada é revogada (WB-100 C4, SEC-106).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ area: string }> }) {
  const { area } = await context.params;
  if (!isSessionArea(area)) return problem(404, 'NOT_FOUND', 'Não encontrado');
  if (!areaAllowedOnHost(area, request.headers)) return problem(404, 'NOT_FOUND', 'Não encontrado');
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

  if (body.mfaRequired === true) {
    // Só o admin tem 2º fator; credencial de admin no painel do lojista responde como senha errada (SEC-106, SEC-121).
    if (area !== 'admin' || !body.mfaToken) return INVALID();
    const challenge = NextResponse.json({ mfaRequired: true }, { headers: { 'cache-control': 'no-store' } });
    writeCookies(challenge.cookies, [pendingCookie('mfa', body.mfaToken, body.expiresIn)]);
    return challenge;
  }
  if (!body.tokens) return problem(502, 'BAD_UPSTREAM', 'Resposta inesperada da API');
  const tokens = body.tokens;
  const mfaSetupRequired = body.mfaSetupRequired === true;

  // SEC-121: admin sem TOTP não deve ficar com sessão `mfa_setup` no painel do lojista.
  if (area === 'lojista' && mfaSetupRequired) {
    await callApi('/v1/auth/logout', { method: 'POST', accessToken: tokens.accessToken, hints });
    return INVALID();
  }
  if (!mfaSetupRequired) {
    const me = await callApi('/v1/me', { accessToken: tokens.accessToken, hints });
    const user = parseJson<Me>(me.text);
    // Lojista: cliente sem loja também entra (vê "Você ainda não tem uma loja", onda-1b E7); credencial de admin, não.
    const allowed = user && (area === 'admin' ? user.adminProfile !== null : user.adminProfile === null);
    if (!allowed) {
      await callApi('/v1/auth/logout', { method: 'POST', accessToken: tokens.accessToken, hints });
      return INVALID();
    }
  }

  const response = NextResponse.json({ mfaSetupRequired }, { headers: { 'cache-control': 'no-store' } });
  writeCookies(response.cookies, sessionCookies(area, tokens));
  if (area === 'admin') writeCookies(response.cookies, [clearedPendingCookie('mfa')]);
  return response;
}
