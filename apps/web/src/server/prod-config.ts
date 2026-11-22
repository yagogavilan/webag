/**
 * SEC-172 (lado web): em produção o servidor se recusa a subir com origem em `http:` ou `localhost`, em vez de publicar canônicas,
 * sitemap, links de loja ou tempo real apontando para o lugar errado. Só olha NOMES de variável na mensagem (nunca o valor). Sem
 * `import 'server-only'` para o teste e o `instrumentation.ts` usarem. Escape para teste local em modo produção (Playwright):
 * `WEBAG_ALLOW_LOCAL_ORIGINS=true`; não deve existir no ambiente real.
 */
type Env = Record<string, string | undefined>;

const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|::1)/i;

function isPublicHttps(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !LOCAL.test(url.hostname);
  } catch {
    return false;
  }
}

const isPublicHost = (raw: string): boolean => /^[a-z0-9.-]+(:\d+)?$/i.test(raw) && !LOCAL.test(raw);

/** Lista de problemas de configuração (vazia = ok). Fora de produção nunca reclama. */
export function productionConfigProblems(env: Env = process.env): string[] {
  if (env.NODE_ENV !== 'production' || env.WEBAG_ALLOW_LOCAL_ORIGINS === 'true') return [];
  const problems: string[] = [];
  for (const name of ['PUBLIC_HOST', 'ADMIN_HOST', 'LOJISTA_HOST']) {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} é obrigatória em produção`);
    else if (!isPublicHost(value)) problems.push(`${name} deve ser um domínio público (sem protocolo e sem localhost)`);
  }
  // SEC-221: `config.ts` só liga Secure/`__Host-` com o texto exato "true"; qualquer outro valor definido (false, 0, vazio, "True") derrubaria os cookies de sessão.
  if (env.COOKIE_SECURE !== undefined && env.COOKIE_SECURE !== 'true') problems.push('COOKIE_SECURE não pode ser diferente de "true" em produção (cookies de sessão perderiam Secure); remova a variável');
  if (!env.BFF_SHARED_SECRET?.trim()) problems.push('BFF_SHARED_SECRET é obrigatória em produção');
  for (const name of ['PUBLIC_URL', 'REALTIME_URL', 'PLAY_STORE_URL', 'APP_STORE_URL']) {
    const value = env[name]?.trim();
    if (value && !isPublicHttps(value)) problems.push(`${name} deve ser https e não pode apontar para localhost`);
  }
  for (const [name, value] of Object.entries(env)) {
    if (/^NEXT_PUBLIC_.*URL$/.test(name) && value?.trim() && !isPublicHttps(value.trim())) problems.push(`${name} (vai para o navegador) deve ser https e não pode apontar para localhost`);
  }
  return problems;
}
