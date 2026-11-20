import { isIP } from 'node:net';

export interface ClientIpOptions {
  /** Proxies confiáveis na frente do web. 0 = ninguém: o X-Forwarded-For é ignorado. */
  hops: number;
  /** Cabeçalho que o proxy confiável sobrescreve com o IP da conexão. */
  header: string | null;
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim().replace(/^\[|\]$/g, '');
  return v && isIP(v) ? v : null;
}

/**
 * IP do cliente a partir de fonte confiável (SEC-114). O navegador escolhe qualquer X-Forwarded-For, então:
 * 1. cabeçalho que o proxy sobrescreve (ex.: X-Real-IP), se configurado;
 * 2. N-ésimo valor a partir da direita do X-Forwarded-For (N = proxies confiáveis), nunca o primeiro;
 * 3. nada configurado: null. A API passa a ver o IP da conexão do BFF (limite mais grosso, mas não falsificável).
 */
export function resolveClientIp(headers: Headers, options: ClientIpOptions): string | null {
  if (options.header) return clean(headers.get(options.header));
  if (options.hops > 0) {
    const chain = (headers.get('x-forwarded-for') ?? '').split(',').map((part) => part.trim());
    return clean(chain[chain.length - options.hops]);
  }
  return null;
}
