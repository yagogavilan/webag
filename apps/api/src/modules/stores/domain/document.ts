/**
 * CPF e CNPJ (WB-051 C1, HIP-031). O CNPJ aceita o formato numérico e o alfanumérico (letras em parte dos 12
 * primeiros caracteres; os 2 dígitos verificadores seguem numéricos). Valor do caractere = código ASCII - 48.
 * [HIPÓTESE R-18] algoritmo alfanumérico conforme a nota técnica da Receita; confirmar na fonte antes do G4.
 */
export type DocumentType = 'cpf' | 'cnpj';

/** Remove máscara e padroniza em maiúsculas. Não valida. */
export const normalizeDocument = (raw: string): string => raw.replace(/[.\-/\s]/g, '').toUpperCase();

const allSame = (value: string): boolean => value.split('').every((char) => char === value[0]);

function checkDigit(chars: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += (chars.charCodeAt(i) - 48) * (weights[i] ?? 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(raw: string): boolean {
  const cpf = normalizeDocument(raw);
  if (!/^\d{11}$/.test(cpf) || allSame(cpf)) return false;
  const d1 = checkDigit(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeDocument(raw);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || allSame(cnpj)) return false;
  const d1 = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

export const isValidDocument = (type: DocumentType, raw: string): boolean => (type === 'cpf' ? isValidCpf(raw) : isValidCnpj(raw));

/** Máscara para quem não é dono nem admin (SEC-023): só os 2 últimos caracteres aparecem. */
export function maskDocument(raw: string): string {
  const doc = normalizeDocument(raw);
  return `${'*'.repeat(Math.max(doc.length - 2, 0))}${doc.slice(-2)}`;
}
