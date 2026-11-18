import 'server-only';

/**
 * Defesa de CSRF das rotas de escrita do BFF (ADR-003): SameSite=Lax nos cookies, cabeçalho obrigatório
 * `X-Webag-Client` (formulário de outro site não consegue enviá-lo sem preflight) e conferência de Origin.
 */
export function csrfProblem(request: Request): string | null {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  if (request.headers.get('x-webag-client') !== 'web') return 'missing-client-header';
  if (request.headers.get('sec-fetch-site') === 'cross-site') return 'cross-site';
  const origin = request.headers.get('origin');
  if (origin) {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    try {
      if (new URL(origin).host !== host) return 'origin-mismatch';
    } catch {
      return 'bad-origin';
    }
  }
  return null;
}
