import 'server-only';
import { API_URL, IS_PROD, bffSecret, clientIpHeader, trustedProxyHops } from './config';
import { resolveClientIp } from './client-ip';

export interface ClientHints {
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

let warnedNoProxy = false;

/**
 * IP e aparelho seguem para a API (limite de tentativas e auditoria dependem deles). O IP NUNCA vem direto do
 * X-Forwarded-For do navegador (SEC-114): ver `resolveClientIp`. Configure `WEB_TRUSTED_PROXY_HOPS` ou `WEB_CLIENT_IP_HEADER`.
 */
export function clientHints(headers: Headers): ClientHints {
  const header = clientIpHeader();
  const hops = trustedProxyHops();
  if (IS_PROD && !header && hops === 0 && !warnedNoProxy) {
    warnedNoProxy = true;
    console.warn('[web] WEB_TRUSTED_PROXY_HOPS/WEB_CLIENT_IP_HEADER não definidos: o IP do cliente não será enviado à API (limites por IP ficam no IP do BFF).');
  }
  return {
    ip: resolveClientIp(headers, { hops, header }),
    userAgent: headers.get('user-agent'),
    deviceId: headers.get('x-device-id'),
  };
}

export interface UpstreamInit {
  method?: string;
  accessToken?: string | null;
  body?: string;
  hints?: ClientHints;
  query?: string;
  /** Padrão `application/json`. A planilha de produtos segue como `text/csv` (única rota que aceita outro tipo). */
  contentType?: string;
  /** Repassado como `Idempotency-Key` (criar produto: repetir o envio não duplica). */
  idempotencyKey?: string;
  /**
   * Credencial `vas_` de "Ver como o lojista" (ADR-018 D8): vai SÓ no cabeçalho `X-View-As`, somada ao Bearer do admin. Campo explícito e
   * de uso exclusivo das rotas `app/api/view-as`; nunca em URL, corpo nem log (esta função não registra cabeçalhos).
   */
  viewAs?: string;
}

export interface UpstreamResult {
  status: number;
  headers: Headers;
  text: string;
}

/** Chamada servidor a servidor para a API. Nunca lança por status HTTP; falha de rede vira 503. */
export async function callApi(path: string, init: UpstreamInit = {}): Promise<UpstreamResult> {
  const headers = new Headers({ accept: 'application/json' });
  if (init.body !== undefined) headers.set('content-type', init.contentType ?? 'application/json');
  if (init.idempotencyKey) headers.set('idempotency-key', init.idempotencyKey);
  if (init.accessToken) headers.set('authorization', `Bearer ${init.accessToken}`);
  if (init.viewAs) headers.set('x-view-as', init.viewAs);
  // Só o BFF, com o segredo, pode declarar o IP do cliente (a API ignora o X-Forwarded-For sem ele).
  const secret = bffSecret();
  if (secret) headers.set('x-webag-bff-secret', secret);
  if (init.hints?.ip) headers.set('x-forwarded-for', init.hints.ip);
  if (init.hints?.userAgent) headers.set('user-agent', init.hints.userAgent);
  if (init.hints?.deviceId) headers.set('x-device-id', init.hints.deviceId);
  try {
    const response = await fetch(`${API_URL}${path}${init.query ?? ''}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    return { status: response.status, headers: response.headers, text: await response.text() };
  } catch {
    const problem = { type: 'about:blank', title: 'API indisponível', status: 503, code: 'UPSTREAM_UNAVAILABLE' };
    return { status: 503, headers: new Headers({ 'content-type': 'application/problem+json' }), text: JSON.stringify(problem) };
  }
}

export function parseJson<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
