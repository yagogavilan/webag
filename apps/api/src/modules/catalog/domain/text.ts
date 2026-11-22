/**
 * Texto puro do cadastro rápido (C-CAD-04, WB-376 C8): o que o lojista digita ou cola nunca é interpretado como fórmula, HTML ou comando.
 * O servidor NÃO "escapa" o texto ao gravar (a tela mostra literal; o React e o CSV escapam na saída): remove o que não deveria existir num
 * nome de produto (caracteres de controle, marcas invisíveis de direção do texto) e normaliza o espaço. Funções puras, testadas por tabela. A saída em CSV usa o `csvCell` único de `platform/http/csv.ts` (SEC-156), que já neutraliza `=`, `+`, `-`, `@`.
 */
// Controle (C0, DEL, C1) e marcas invisíveis: zero-width (200B-200F), direção (202A-202E, 2066-2069), BOM (FEFF), separadores de linha/parágrafo (2028/2029).
const hex = (n: number): string => `\\u{${n.toString(16)}}`;
const INVISIBLE = [[0x200b, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => `${hex(a!)}-${hex(b!)}`).join('');
const CONTROL = new RegExp(`[\\p{Cc}${INVISIBLE}]`, 'gu');

/** Linha única (nome, atributo, valor): controle some, qualquer espaço em sequência vira 1 espaço, extremos aparados. */
export function cleanLine(raw: string): string {
  return raw
    .replace(/[\t\n\r\v\f]+/g, ' ')
    .replace(CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto de várias linhas (descrição): mantém a quebra de linha, remove o resto do controle, limita a 2 quebras seguidas. */
export function cleanMultiline(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\v\f]+/g, ' ')
    .replace(CONTROL, (char) => (char === '\n' ? char : ''))
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
