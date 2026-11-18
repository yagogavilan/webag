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

/**
 * Máscara de moeda "da direita para a esquerda": cada dígito digitado entra nos centavos ("7990" vira "79,90").
 * Devolve os centavos (0 se não houver dígito) limitados a `max`.
 */
export function centsFromDigits(text: string, max = 9_999_999): number {
  const digits = text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
  return Math.min(max, digits === '' ? 0 : Number(digits));
}

/** Texto do campo de preço: vazio quando não há valor, senão "79,90" (o "R$" fica no rótulo do campo). */
export function moneyField(cents: number | null): string {
  return cents === null || cents <= 0 ? '' : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
