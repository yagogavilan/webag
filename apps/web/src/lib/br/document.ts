import { cnpjChars, onlyDigits } from './mask';

/** CPF: 11 dígitos, dois dígitos verificadores (módulo 11), sem sequência repetida. */
export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Valor de cada caractere no cálculo: código ASCII menos 48 (0 a 9 valem 0 a 9; A vale 17, B 18, ...). */
const charValue = (ch: string): number => ch.charCodeAt(0) - 48;

function cnpjDigit(chars: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += charValue(chars[i] ?? '0') * (weights[i] ?? 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/**
 * CNPJ numérico ou alfanumérico (R-18): mesmo módulo 11, com o valor do caractere = ASCII - 48. Os dois últimos
 * caracteres (DV) são sempre dígitos. [HIPÓTESE: algoritmo e vigência do formato alfanumérico conferidos pela
 * documentação pública da Receita Federal; confirmar na fonte antes do G4 — ver pendencias-contrato-web-lojista.md.]
 */
export function isValidCnpj(value: string): boolean {
  const c = cnpjChars(value);
  if (c.length !== 14 || !/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const d1 = cnpjDigit(c, CNPJ_W1);
  const d2 = cnpjDigit(c.slice(0, 12) + String(d1), CNPJ_W2);
  return d1 === Number(c[12]) && d2 === Number(c[13]);
}

/** Mensagem de erro do campo (onda-2 L3). `undefined` = válido ou ainda vazio. */
export function documentError(type: 'cpf' | 'cnpj', value: string): string | undefined {
  if (type === 'cpf') return isValidCpf(value) ? undefined : 'Confira o CPF.';
  return isValidCnpj(value) ? undefined : 'Confira o CNPJ. Os números não conferem.';
}
