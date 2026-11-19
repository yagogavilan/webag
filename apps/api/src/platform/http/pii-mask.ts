/** Máscaras do admin (B4/B5, WB-102 C2 e WB-108 C4): o painel mostra o suficiente para reconhecer a pessoa, nunca o dado inteiro. "Revelar" é fase 2 (DEC-071). */

/** "Maria Souza Lima" vira "Maria L."; nome único fica como está. */
export function maskName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts.at(-1)![0]!.toUpperCase()}.`;
}

/** "maria@gmail.com" vira "m***@gmail.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** "11999998888" vira "(11) 9****-8888" (10 dígitos: "(11) ****-8888"). */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits[2]}****-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ****-${digits.slice(6)}`;
  return digits.length >= 4 ? `****${digits.slice(-4)}` : null;
}

/** Escapa `%`, `_` e `\` para a busca por trecho (LIKE) não virar curinga. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);
