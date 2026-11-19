import 'server-only';

/** URL interna da API. Só existe no servidor do web: o navegador nunca fala direto com a API (BFF, ver SEC-106). */
export const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const IS_PROD = process.env.NODE_ENV === 'production';

/** Cookies `Secure` (e prefixos `__Host-`/`__Secure-`). Desligar só em HTTP local de teste. */
export const COOKIE_SECURE = (process.env.COOKIE_SECURE ?? String(IS_PROD)) === 'true';

/** Tempo de vida do cookie de refresh (ADR-003: 30 dias deslizantes). */
export const REFRESH_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;

/**
 * Quantos proxies confiáveis (nginx, balanceador) ficam entre o navegador e o web. O IP do cliente é o N-ésimo valor
 * a partir da DIREITA do X-Forwarded-For (SEC-114). Sem padrão: não definido = o X-Forwarded-For do navegador é ignorado.
 */
export function trustedProxyHops(): number {
  const n = Number.parseInt(process.env.WEB_TRUSTED_PROXY_HOPS ?? '', 10);
  return Number.isInteger(n) && n > 0 && n <= 5 ? n : 0;
}

/** Nome do cabeçalho que o proxy confiável SOBRESCREVE com o IP da conexão (ex.: `x-real-ip` com `proxy_set_header X-Real-IP $remote_addr`). */
export function clientIpHeader(): string | null {
  const name = process.env.WEB_CLIENT_IP_HEADER?.trim().toLowerCase();
  return name && /^[a-z0-9-]{1,40}$/.test(name) ? name : null;
}

/** Segredo que o BFF envia à API (`X-Webag-Bff-Secret`) para que ela só aceite o IP declarado por ele (SEC-114). Fica só no servidor. */
export function bffSecret(): string | null {
  return process.env.BFF_SHARED_SECRET?.trim() || null;
}

/** Host de cada painel (`admin.webag.com.br`, sem protocolo). Obrigatórios em produção (SEC-116); em dev, vazio = qualquer host. */
export function areaHost(area: 'admin' | 'lojista'): string | null {
  const value = (area === 'admin' ? process.env.ADMIN_HOST : process.env.LOJISTA_HOST)?.trim().toLowerCase();
  return value || null;
}

/**
 * Host público (páginas sem login do painel, como `/pagar/cartao`; SEC-106): sem sessão de painel e com CSP própria.
 * Em produção é obrigatório (falha fechada); em dev, vazio = qualquer host.
 */
export function publicHost(): string | null {
  return process.env.PUBLIC_HOST?.trim().toLowerCase() || null;
}

/** Esquema do deep link do app (`webag://`), usado para voltar da página de cartão. */
export function appScheme(): string {
  const value = process.env.APP_SCHEME?.trim().toLowerCase() ?? '';
  return /^[a-z][a-z0-9+.-]{1,30}$/.test(value) ? value : 'webag';
}
