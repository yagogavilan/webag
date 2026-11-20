import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Me, SessionState } from '@/lib/session-types';
import { cookieNames, type SessionArea } from './cookies';
import { callApi, parseJson } from './upstream';

/**
 * Estado da sessão para os layouts (Server Components). A renovação do access token acontece antes, no `proxy.ts`.
 * Aqui só lemos. A autorização de verdade é sempre da API; isto só decide qual tela renderizar.
 */
export const getSession = cache(async (area: SessionArea): Promise<SessionState> => {
  const jar = await cookies();
  const token = jar.get(cookieNames(area).access)?.value;
  if (!token) return { status: 'anonymous' };

  const result = await callApi('/v1/me', { accessToken: token });
  if (result.status === 403 && parseJson<{ code?: string }>(result.text)?.code === 'MFA_REQUIRED') {
    return { status: 'mfa_setup' };
  }
  if (result.status !== 200) return { status: 'anonymous' };
  const user = parseJson<Me>(result.text);
  if (!user) return { status: 'anonymous' };
  if (area === 'admin' && !user.adminProfile) return { status: 'anonymous' };
  // Lojista: cliente sem loja também tem sessão aqui (a tela diz "Você ainda não tem uma loja"); admin não (SEC-106).
  if (area === 'lojista' && user.adminProfile) return { status: 'anonymous' };
  return { status: 'ok', user };
});
