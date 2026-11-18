import { randomInt } from 'node:crypto';

/** Sem 0/O/1/I/L: o código é ditado por telefone e lido no balcão. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateOrderNumber(): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `WB-${code}`;
}

/** 4 dígitos para a retirada (só mostrado depois de pago). */
export const generatePickupCode = (): string => String(randomInt(10_000)).padStart(4, '0');
