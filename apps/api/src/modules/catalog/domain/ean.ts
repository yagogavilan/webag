/**
 * EAN/GTIN (RN-Q7, WB-373 C9): 8, 12, 13 ou 14 dígitos com dígito verificador correto (módulo 10 do GS1). O servidor confere SEMPRE (o app só ajuda).
 * Leitura em R2: aqui só a regra pura. Base externa: desligada (flag `ean_base_externa`) e nenhum adaptador externo é escrito até o F9.
 */
export const EAN_LENGTHS: readonly number[] = [8, 12, 13, 14];

/** Dígito verificador de `body` (sem o último dígito): pesos 3 e 1 alternados a partir da direita. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(raw: string): boolean {
  if (!/^\d+$/.test(raw) || !EAN_LENGTHS.includes(raw.length)) return false;
  return gtinCheckDigit(raw.slice(0, -1)) === Number(raw.at(-1));
}
