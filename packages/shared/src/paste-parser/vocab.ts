/** Vocabulário do leitor (minúsculo, sem depender de regex). [HIPÓTESE] listas montadas pelo time, a validar com listas reais. */

export const PRICE_LABELS: ReadonlySet<string> = new Set(['preço', 'preco', 'valor', 'vlr']);
export const QUANTITY_LABELS: ReadonlySet<string> = new Set(['qtd', 'qtde', 'qde', 'qte', 'quantidade', 'estoque', 'est']);
export const SIZE_LABELS: ReadonlySet<string> = new Set(['tam', 'tams', 'tamanho', 'tamanhos', 'nº', 'n°', 'num', 'numero', 'número']);
export const COLOR_LABELS: ReadonlySet<string> = new Set(['cor', 'cores']);
/** Palavras que, coladas a ":" ("tam:P"), separam o marcador do valor. */
export const MARKER_WORDS: ReadonlySet<string> = new Set([
  ...PRICE_LABELS,
  ...QUANTITY_LABELS,
  ...SIZE_LABELS,
  ...COLOR_LABELS,
]);

/** Unidades que sempre indicam estoque. */
export const QUANTITY_UNITS: ReadonlySet<string> = new Set(['un', 'und', 'unid', 'unids', 'unidade', 'unidades', 'uni', 'unds']);
/** "7 peças" pode ser composição de kit; só vale como estoque depois do preço (ou sem preço). */
export const PIECE_UNITS: ReadonlySet<string> = new Set([
  'pç', 'pçs', 'pc', 'pcs', 'peça', 'peças', 'peca', 'pecas', 'par', 'pares',
]);

/** Número seguido destas palavras é medida (parte do nome), não preço nem quantidade. */
export const MEASURE_UNITS: ReadonlySet<string> = new Set([
  'cm', 'mm', 'ml', 'kg', 'mg', 'gr', 'grs', 'lt', 'lts', 'litro', 'litros', 'mts', 'metro', 'metros',
  'pol', 'polegadas', 'volts', 'watts', 'kw', 'cmts',
]);
/** Medida de uma letra: `l`, `w`, `v` em qualquer caixa; `m` e `g` só minúsculos (maiúsculos são tamanho). */
export const MEASURE_LETTERS_ANY_CASE: ReadonlySet<string> = new Set(['l', 'w', 'v']);
export const MEASURE_LETTERS_LOWER_ONLY: ReadonlySet<string> = new Set(['m', 'g']);

export const SIZE_WORDS: ReadonlySet<string> = new Set([
  'PP', 'P', 'M', 'G', 'GG', 'XP', 'XG', 'XGG', 'XXG', 'EXG', 'EXGG', 'G1', 'G2', 'G3', 'G4',
]);
/** Atalhos colados: "PMG" = P, M, G. */
export const SIZE_SHORTHAND: ReadonlyMap<string, readonly string[]> = new Map([
  ['PMG', ['P', 'M', 'G']],
  ['PMGG', ['P', 'M', 'G', 'GG']],
]);
export const SIZE_SINGLE_WORDS: ReadonlySet<string> = new Set(['U', 'UNICO', 'ÚNICO']);

export const COLOR_WORDS: ReadonlySet<string> = new Set([
  'preto', 'preta', 'branco', 'branca', 'azul', 'vermelho', 'vermelha', 'verde', 'amarelo', 'amarela', 'rosa',
  'cinza', 'bege', 'marrom', 'laranja', 'roxo', 'roxa', 'lilás', 'lilas', 'vinho', 'nude', 'dourado', 'dourada',
  'prata', 'prateado', 'prateada', 'grafite', 'mostarda', 'caramelo', 'salmão', 'salmao', 'turquesa', 'coral',
  'colorido', 'colorida', 'estampado', 'estampada',
]);
export const COLOR_MODIFIERS: ReadonlySet<string> = new Set([
  'claro', 'clara', 'escuro', 'escura', 'marinho', 'bebê', 'bebe', 'royal', 'militar', 'petróleo', 'petroleo',
  'neon', 'pastel', 'chumbo', 'mescla',
]);

/** Nome com estas palavras libera o tamanho numérico 33 a 48 (RN-Q8 b). */
export const FOOTWEAR_WORDS: ReadonlySet<string> = new Set([
  'tenis', 'sandalia', 'sandalias', 'bota', 'botas', 'chinelo', 'chinelos', 'sapato', 'sapatos',
]);

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}
