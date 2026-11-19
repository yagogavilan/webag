/**
 * CSV seguro para planilha (SEC-156). Um único lugar para todas as exportações:
 *  - célula que começa com `=`, `+`, `-`, `@`, TAB ou CR ganha um apóstrofo (a planilha trata como texto, não como fórmula);
 *  - célula com o separador, aspas, CR ou LF vai ENTRE ASPAS (com `"` dobrado), então uma quebra de linha no texto livre
 *    nunca começa uma "linha nova" cuja 1ª célula seria `=HYPERLINK(...)`.
 * Números e valores monetários que o servidor formata NÃO passam por aqui (um `-5,00` legítimo não vira texto).
 */
export function csvCell(value: unknown, separator: ',' | ';' = ';'): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' ? String(value) : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Linha de células de TEXTO (use `csvCell` direto em colunas mistas). */
export const csvLine = (cells: readonly unknown[], separator: ',' | ';' = ';'): string => cells.map((c) => csvCell(c, separator)).join(separator);

export const CSV_BOM = String.fromCharCode(0xfeff);
