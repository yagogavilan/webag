import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/** Cabeçalho que só o BFF do painel web (Next) manda, junto com o segredo compartilhado (SEC-114). */
export const BFF_SECRET_HEADER = 'x-webag-bff-secret';

/**
 * `TRUST_PROXY` (SEC-114): inteiro 0..5 (saltos) OU lista de IPs/sub-redes separados por vírgula. Lista é preferível:
 * só os proxies listados (nginx, BFF) podem declarar o IP do cliente via X-Forwarded-For. `/0` e `0.0.0.0` são recusados
 * porque confiariam na internet inteira.
 */
export function parseTrustProxy(raw: string | undefined): { value: number | string[] | undefined; error?: string } {
  if (raw === undefined || raw.trim() === '') return { value: undefined };
  const text = raw.trim();
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    return hops > 5 ? { value: undefined, error: 'saltos de proxy entre 0 e 5' } : { value: hops };
  }
  const parts = text.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) return { value: undefined, error: 'lista vazia' };
  for (const part of parts) {
    const [address = '', prefix, extra] = part.split('/');
    const family = isIP(address);
    const max = family === 4 ? 32 : 128;
    if (family === 0 || extra !== undefined) return { value: undefined, error: 'use inteiro (0 a 5) ou lista de IP/CIDR' };
    if (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > max)) return { value: undefined, error: 'prefixo de CIDR inválido' };
    if (prefix !== undefined && Number(prefix) === 0) return { value: undefined, error: 'CIDR /0 confia na internet inteira' };
    if (/^0+(\.0+){3}$/.test(address) || address === '::') return { value: undefined, error: 'endereço coringa não é aceito' };
  }
  return { value: parts };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * O BFF do painel fala com a API dentro da rede e manda o IP do navegador (já resolvido por ele, de fonte confiável) em
 * `X-Forwarded-For`. Esse valor vale SOMENTE com o segredo correto em `X-Webag-Bff-Secret` (comparação em tempo
 * constante); vale o primeiro IP válido da lista (se um proxy acrescentou o dele depois). Com o segredo certo e sem
 * XFF, vale o IP da conexão. Sem segredo (ou errado), nada muda: vale o IP resolvido por `trust proxy` (lista de CIDR).
 */
export function bffClientIp(secret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const given = req.headers[BFF_SECRET_HEADER];
    if (secret && typeof given === 'string' && safeEqual(given, secret)) {
      const forwarded = req.headers['x-forwarded-for'];
      const first = (typeof forwarded === 'string' ? forwarded.split(',')[0] : undefined)?.trim();
      const ip = first && isIP(first) !== 0 ? first : (req.socket.remoteAddress ?? null);
      if (ip) Object.defineProperty(req, 'ip', { value: ip, configurable: true });
    }
    // Nunca deixa o segredo seguir adiante (logs, proxies).
    delete req.headers[BFF_SECRET_HEADER];
    next();
  };
}
