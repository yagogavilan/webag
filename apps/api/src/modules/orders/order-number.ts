import { randomInt } from 'node:crypto';

/** Sem 0/O/1/I/L: o código é ditado por telefone e lido no balcão. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateOrderNumber(): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `WB-${code}`;
}

/** Código de retirada (`codigo_retirada_digitos`, 4 a 6 dígitos; só mostrado depois de pago). */
export const generatePickupCode = (digits = 4): string => String(randomInt(10 ** digits)).padStart(digits, '0');
