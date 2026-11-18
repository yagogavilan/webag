import 'server-only';
import { API_URL } from './config';

export interface ClientHints {
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

/** IP e aparelho reais seguem para a API (limite de tentativas e auditoria dependem deles). Exige TRUST_PROXY=1 na API. */
export function clientHints(headers: Headers): ClientHints {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ip: forwarded || headers.get('x-real-ip'),
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
}

export interface UpstreamResult {
  status: number;
  headers: Headers;
  text: string;
}

/** Chamada servidor a servidor para a API. Nunca lança por status HTTP; falha de rede vira 503. */
export async function callApi(path: string, init: UpstreamInit = {}): Promise<UpstreamResult> {
  const headers = new Headers({ accept: 'application/json' });
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  if (init.accessToken) headers.set('authorization', `Bearer ${init.accessToken}`);
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
