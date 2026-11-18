import 'server-only';
import { createHash } from 'node:crypto';
import type { TokenPair } from './cookies';
import { callApi, parseJson, type ClientHints } from './upstream';

/**
 * O refresh da API é rotativo e o reuso derruba a sessão inteira (ADR-003). Várias requisições do mesmo
 * navegador podem tentar renovar ao mesmo tempo; sem isto, a segunda usaria um token já girado.
 * Compartilha a promessa por 15 s, por refresh token (hash), via globalThis (proxy.ts e route handlers).
 * Limite conhecido: por processo. Com mais de uma instância do web, usar afinidade de sessão ou Redis.
 */
interface Entry {
  promise: Promise<TokenPair | null>;
  at: number;
}
const store = ((globalThis as { __wbRefresh?: Map<string, Entry> }).__wbRefresh ??= new Map());
const WINDOW_MS = 15_000;

interface RefreshBody {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function refreshSession(refreshToken: string, hints: ClientHints): Promise<TokenPair | null> {
  const key = createHash('sha256').update(refreshToken).digest('hex');
  const now = Date.now();
  for (const [k, entry] of store) if (now - entry.at > WINDOW_MS) store.delete(k);
  const existing = store.get(key);
  if (existing) return existing.promise;

  const promise = callApi('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }), hints }).then((result) => {
    if (result.status !== 200) return null;
    const body = parseJson<RefreshBody>(result.text);
    return body ? { accessToken: body.accessToken, refreshToken: body.refreshToken, expiresIn: body.expiresIn } : null;
  });
  store.set(key, { promise, at: now });
  return promise;
}
