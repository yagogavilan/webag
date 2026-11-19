import { Linking } from 'react-native';
import { API_URL } from '../../api/config';
import { APP_ENV, isSecureCardUrl, WEB_PUBLIC_URL } from '../checkout/config';

/** Páginas públicas do Webag (apps/web, DEC-057). A origem vem de `EXPO_PUBLIC_WEB_URL` por ambiente; nunca fixa no código. */
export const webPageUrl = (path: '/termos' | '/privacidade' | '/licencas', base: string = WEB_PUBLIC_URL): string => `${base}${path}`;

/**
 * Tipos de link que o app abre fora dele (SEC-172, M.3). Cada tipo tem seu domínio permitido; qualquer outra coisa nunca abre.
 * - `web`: páginas públicas do Webag (Termos, Política, Licenças), origem de `EXPO_PUBLIC_WEB_URL`.
 * - `api`: download do pacote de dados (link de uso único que a API devolve), origem de `EXPO_PUBLIC_API_URL`.
 * - `card`: página segura do cartão (rota e token fixos, SEC-126).
 * - `whatsapp`: `https://wa.me/<dígitos>` (suporte e loja).
 * - `maps`: busca do Google Maps ("Como chegar").
 * - `license`: texto da licença ou página do projeto de um crédito de `legal/credits.ts` (domínios fixos abaixo).
 */
export type LinkKind = 'web' | 'api' | 'card' | 'whatsapp' | 'maps' | 'license';

/** Domínios dos textos de licença de `legal/credits.ts`. Novo crédito com outro domínio exige incluí-lo aqui (e o teste avisa). */
export const LICENSE_HOSTS: readonly string[] = ['creativecommons.org', 'github.com', 'openfontlicense.org'];

export interface LinkContext {
  web: string;
  api: string;
  /** `http:` só no desenvolvimento (localhost). Em preview e production só `https:` (o build também recusa a origem insegura). */
  allowHttp: boolean;
}

const defaultContext = (): LinkContext => ({ web: WEB_PUBLIC_URL, api: API_URL, allowHttp: APP_ENV === 'development' });

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Mesma origem da configurada, https (ou http no dev) e sem usuário/senha embutidos (`https://webag.com.br@evil`). */
function sameOrigin(url: URL, base: string, allowHttp: boolean): boolean {
  const origin = parse(base);
  if (!origin) return false;
  const schemeOk = url.protocol === 'https:' || (allowHttp && url.protocol === 'http:');
  return schemeOk && url.origin === origin.origin && !url.username && !url.password;
}

/** O endereço é de um destino permitido para este tipo de link? Função pura: toda abertura do app passa por ela. */
export function isAllowedExternalUrl(raw: string, kind: LinkKind, ctx: LinkContext = defaultContext()): boolean {
  if (kind === 'card') return isSecureCardUrl(raw, ctx.web);
  const url = parse(raw);
  if (!url || url.username || url.password) return false;
  switch (kind) {
    case 'web':
      return sameOrigin(url, ctx.web, ctx.allowHttp);
    case 'api':
      return sameOrigin(url, ctx.api, ctx.allowHttp);
    case 'whatsapp':
      return url.protocol === 'https:' && url.hostname === 'wa.me' && /^\/\d{10,15}$/.test(url.pathname);
    case 'maps':
      return url.protocol === 'https:' && url.hostname === 'www.google.com' && url.pathname === '/maps/search/';
    case 'license':
      return url.protocol === 'https:' && LICENSE_HOSTS.includes(url.hostname);
  }
}

/**
 * Abre no navegador do sistema (não num WebView do app) SÓ se o endereço passa por `isAllowedExternalUrl`.
 * `false` = não abriu (recusado ou sem app): a tela mostra o endereço para copiar.
 */
export async function openExternal(url: string, kind: LinkKind = 'web'): Promise<boolean> {
  if (!isAllowedExternalUrl(url, kind)) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** E-mail de contato vindo da API (encarregado, suporte): só endereço simples, sem parâmetros injetados (`a@b.com?cc=...`). */
export const isSafeMailAddress = (email: string): boolean => /^[^\s@,;?&=<>"]+@[^\s@,;?&=<>"]+\.[^\s@,;?&=<>"]{2,}$/.test(email);

/** `mailto:` com o endereço validado e o corpo codificado. `false` = endereço inválido ou nenhum app de e-mail. */
export async function openMailto(email: string | null | undefined, body?: string): Promise<boolean> {
  const address = (email ?? '').trim();
  if (!isSafeMailAddress(address)) return false;
  try {
    await Linking.openURL(`mailto:${address}${body ? `?body=${encodeURIComponent(body)}` : ''}`);
    return true;
  } catch {
    return false;
  }
}
