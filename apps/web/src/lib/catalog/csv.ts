/** Importação por planilha (onda-2 K5, WB-065). Os limites espelham a API (`domain/import.ts`): CSV, 1 MB, 500 linhas. */
export const IMPORT_COLUMNS = ['nome', 'categoria', 'descricao', 'preco', 'promocional', 'promo_inicio', 'promo_fim', 'variacao1', 'variacao2', 'estoque', 'codigo'] as const;
export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_LINES = 500;

export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Number(mb.toFixed(1)).toLocaleString('pt-BR')} MB`;
}

/** Confere nome e tamanho antes de ler o arquivo. Devolve a mensagem da tela K5 ou `null`. */
export function validateCsvFile(file: { name: string; size: number; type?: string }): string | null {
  if (file.size > IMPORT_MAX_BYTES) return `Esse arquivo tem ${formatMb(file.size)}. O máximo é ${formatMb(IMPORT_MAX_BYTES)}.`;
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain/i.test(file.type ?? '')) return 'Use o modelo do Webag, em CSV.';
  return null;
}

/** UTF-8; se o arquivo não for (Excel em português salva em Windows-1252), lê como Windows-1252 para não quebrar os acentos. */
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** Célula segura: aspas duplas escapadas e prefixo contra fórmula (`=`, `+`, `-`, `@`) quando o Excel abrir o arquivo. */
function cell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV das linhas com erro para o lojista corrigir ("Baixar as 2 linhas com erro"). Com BOM e `;` para abrir certo no Excel. */
export function errorsCsv(errors: { line: number; message: string }[]): string {
  return `﻿${['linha;motivo', ...errors.map((item) => `${cell(item.line)};${cell(item.message)}`)].join('\r\n')}\r\n`;
}
