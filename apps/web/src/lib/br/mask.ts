/** Máscaras de entrada brasileiras. Todas aceitam o que o usuário colar (com ou sem pontuação) e devolvem o texto formatado. */
export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** `(11) 99999-9999` (celular) ou `(11) 9999-9999` (fixo). */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= (d.length > 10 ? 5 : 4)) return `(${ddd}) ${rest}`;
  const cut = d.length > 10 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/** DDD de 11 a 99; com 11 dígitos, o 3º é 9 (celular). Aceita 10 (fixo) ou 11. */
export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  return d.length === 10 || d[2] === '9';
}

/** `07900-000`. */
export function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

/** CNPJ alfanumérico (R-18): as 12 primeiras posições aceitam letras e dígitos; as 2 últimas (DV) são dígitos. */
export function cnpjChars(value: string): string {
  const raw = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
  return raw.slice(0, 12) + raw.slice(12).replace(/\D/g, '');
}

export function maskCnpj(value: string): string {
  const c = cnpjChars(value);
  let out = c.slice(0, 2);
  if (c.length > 2) out += `.${c.slice(2, 5)}`;
  if (c.length > 5) out += `.${c.slice(5, 8)}`;
  if (c.length > 8) out += `/${c.slice(8, 12)}`;
  if (c.length > 12) out += `-${c.slice(12)}`;
  return out;
}

/** Mascara conforme o tipo escolhido na etapa 1 (CPF ou CNPJ). */
export function maskDocument(type: 'cpf' | 'cnpj', value: string): string {
  return type === 'cpf' ? maskCpf(value) : maskCnpj(value);
}

const TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.com.br': 'gmail.com',
  'gamil.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yaho.com.br': 'yahoo.com.br',
  'yahoo.con': 'yahoo.com',
  'icloud.con': 'icloud.com',
};

/** "Quis dizer gmail.com?" (onda-2 L1). Só sugere domínios de erro de digitação comum. */
export function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return TYPOS[domain] ?? null;
}

export const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
