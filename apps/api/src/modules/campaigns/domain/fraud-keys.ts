import { createHmac } from 'node:crypto';

/**
 * Antifraude de cupom (ADR-019 D6, WB-344): SÓ HMAC-SHA256 hexadecimal, com entrada em domínio separado (`coupon:<kind>:<valor normalizado>`, Q10). Nada de dado em claro.
 * `current` é a chave que ESCREVE e que toma o `pg_advisory_xact_lock` (todos os escritores convergem nela); a leitura confere `current` e `previous` (rotação, 12 meses).
 */
export type IdentifierKind = 'account' | 'account_email' | 'device' | 'address' | 'document';

export interface FraudKeys {
  current: string;
  previous: string | null;
}

const digits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');
const alnum = (value: string | null | undefined): string => (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Valor normalizado por tipo; `null` = não há identificador utilizável (ex.: endereço sem número). */
export function normalizeIdentifier(kind: IdentifierKind, raw: string): string | null {
  switch (kind) {
    case 'account':
    case 'account_email':
    case 'device':
      return raw.trim().length > 0 ? raw.trim().toLowerCase() : null;
    case 'document': {
      const d = digits(raw);
      return d.length === 11 ? d : null;
    }
    case 'address':
      return raw.length > 0 ? raw : null;
  }
}

/** SEC-225: endereço = CEP + número normalizados, SEM o complemento. */
export const addressIdentifier = (cep: string | null | undefined, number: string | null | undefined): string | null => {
  const c = digits(cep);
  const n = alnum(number);
  return c.length === 8 && n.length > 0 ? `${c}:${n}` : null;
};

export function hmacOf(key: string, kind: IdentifierKind, normalized: string): string {
  return createHmac('sha256', key).update(`coupon:${kind}:${normalized}`).digest('hex');
}

/** Os HMACs de um identificador nas chaves em vigor: o da chave atual primeiro (escrita e trava), o da anterior (leitura). */
export function hmacsOf(keys: FraudKeys, kind: IdentifierKind, normalized: string): { current: string; all: string[] } {
  const current = hmacOf(keys.current, kind, normalized);
  return { current, all: keys.previous ? [current, hmacOf(keys.previous, kind, normalized)] : [current] };
}

/** `ip` e `device` em chaves de Redis também são HMAC (o IP nunca em claro, padrão I6). */
export const rateKey = (keys: FraudKeys, scope: 'account' | 'ip' | 'device', value: string): string =>
  `coupon-attempt:${scope}:${hmacOf(keys.current, scope === 'ip' ? 'device' : scope, `${scope}:${value.trim().toLowerCase()}`)}`;
