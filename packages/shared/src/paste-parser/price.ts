/**
 * Preço em reais -> centavos inteiros, sem ponto flutuante.
 * Formas aceitas (BR): `79,90` `79.90` `79,9` `1.299,90` `1299,90` `1.299` (milhar) `49` (inteiro) e `1,299.90` (estilo EUA).
 */
export type PriceShape = 'decimal' | 'thousands' | 'integer';

export interface ParsedPrice {
  cents: number;
  shape: PriceShape;
  /** Dígitos depois da vírgula (0 a 2). */
  fractionDigits: number;
}

// Todas ancoradas, com repetições de largura fixa: sem retrocesso exponencial.
const THOUSANDS = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/;
const US_STYLE = /^(\d{1,3}(?:,\d{3})+)\.(\d{1,2})$/;
const DECIMAL = /^(\d{1,9})[.,](\d{1,2})$/;
const INTEGER = /^\d{1,9}$/;

function toCents(whole: string, fraction: string | undefined): number {
  const reais = Number.parseInt(whole.replace(/[.,]/g, ''), 10);
  const centavos = fraction === undefined ? 0 : Number.parseInt(fraction.padEnd(2, '0'), 10);
  return reais * 100 + centavos;
}

export function parsePriceToken(token: string): ParsedPrice | null {
  if (token.length > 20) return null;
  const thousands = THOUSANDS.exec(token);
  if (thousands?.[1]) {
    const fraction = thousands[2];
    return {
      cents: toCents(thousands[1], fraction),
      shape: fraction === undefined ? 'thousands' : 'decimal',
      fractionDigits: fraction?.length ?? 0,
    };
  }
  const us = US_STYLE.exec(token);
  if (us?.[1] && us[2]) return { cents: toCents(us[1], us[2]), shape: 'decimal', fractionDigits: us[2].length };
  const decimal = DECIMAL.exec(token);
  if (decimal?.[1] && decimal[2]) {
    return { cents: toCents(decimal[1], decimal[2]), shape: 'decimal', fractionDigits: decimal[2].length };
  }
  if (INTEGER.test(token)) return { cents: toCents(token, undefined), shape: 'integer', fractionDigits: 0 };
  return null;
}
