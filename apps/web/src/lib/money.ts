/** Valor digitado em reais ("7", "7,5", "R$ 7,50", "1.250,00") para centavos. `null` se não for um valor. */
export function parseCents(text: string): number | null {
  const clean = text.replace(/R\$|\s/g, '');
  if (clean === '') return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, '') : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Centavos para o campo ("7,50"); vazio quando for `null`. */
export function centsInput(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

/** Número com vírgula ("2,5") para o campo de quilômetros e minutos. `null` se inválido. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

export function kmInput(km: number): string {
  return String(km).replace('.', ',');
}

/** "Grátis" quando for zero. */
export function feeLabel(cents: number, format: (cents: number) => string): string {
  return cents === 0 ? 'Grátis' : format(cents);
}
