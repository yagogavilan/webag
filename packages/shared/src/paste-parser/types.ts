/** Limites do texto colado (RN-Q8, DEC-118, WB-376 C3/C8). */
export const PASTE_MAX_LINES = 100;
export const PASTE_MAX_LINE_LENGTH = 200;
export const PASTE_NAME_MAX_LENGTH = 80;
export const PASTE_QUANTITY_MAX = 99_999;
/** R$ 99.999,99 (WB-066 C2). */
export const PASTE_PRICE_MAX_CENTS = 9_999_999;

/** Quão seguro o leitor está de um campo. `none` = nada lido. */
export type PasteConfidence = 'high' | 'medium' | 'low' | 'none';

export interface PasteField<T> {
  value: T;
  confidence: PasteConfidence;
  /** `true` quando o valor não veio do texto (ex.: quantidade ausente vira 1). */
  assumed: boolean;
}

export type PasteFieldName = 'name' | 'price' | 'quantity' | 'sizes';

export type PasteIssue =
  /** Sem nome legível. Bloqueia. */
  | { code: 'missing_name'; severity: 'blocking' }
  /** "Falta o preço". Bloqueia. */
  | { code: 'missing_price'; severity: 'blocking' }
  /** Preço zero ou acima de R$ 99.999,99. Bloqueia. */
  | { code: 'invalid_price'; severity: 'blocking' }
  /** Quantidade acima de 99.999 ou não inteira. Bloqueia. */
  | { code: 'invalid_quantity'; severity: 'blocking' }
  /** "Mais de um preço": nada é adivinhado; `splitLines` alimenta "Separar em N linhas". */
  | { code: 'multiple_prices'; severity: 'confirm'; candidatesCents: number[]; splitLines: string[] }
  /** Mais de uma quantidade na linha ("P 2un M 3un"). Nada é adivinhado. */
  | { code: 'multiple_quantities'; severity: 'confirm'; candidates: number[] }
  /** Vários tamanhos na mesma linha ("tam P M G"): o app confirma (grade ou separar). */
  | { code: 'multiple_sizes'; severity: 'confirm'; sizes: string[] }
  /** Campo lido com confiança baixa: o app marca "Confira". */
  | { code: 'check_field'; severity: 'confirm'; field: PasteFieldName; reason: PasteCheckReason }
  /** Linha com mais de 200 caracteres: cortada. Nunca "pronta"; o preço lido ganha `check_field` com `line_truncated`. */
  | { code: 'line_truncated'; severity: 'confirm' }
  /** Nome com mais de 80 caracteres: cortado. */
  | { code: 'name_truncated'; severity: 'confirm' };

export type PasteCheckReason =
  | 'integer_price'
  | 'thousands_price'
  | 'numeric_size'
  | 'bare_quantity'
  | 'lowercase_size'
  /** Linha cortada em 200 caracteres: o preço lido pode ser só um pedaço ("R$ 1" de "R$ 1.299,90"). */
  | 'line_truncated';

/**
 * `ready`: nome e preço lidos sem dúvida. `confirm`: lido, mas o app deve pedir confirmação.
 * `incomplete`: falta nome ou preço (vira rascunho marcado, não entra em "Publicar os válidos").
 */
export type PasteDraftStatus = 'ready' | 'confirm' | 'incomplete';

export interface PasteDraft {
  /** Número (1-based) da linha física no texto colado, para "Voltar e editar o texto". */
  line: number;
  /** Linha limpa (sem controle/emoji, no máximo 200 caracteres). Só para exibir. */
  source: string;
  name: PasteField<string | null>;
  /** Nome sem cor implícita: com a cor, é a chave para sugerir "Juntar linhas" (só a mesma cor, DEC-128). */
  baseName: string | null;
  sizes: PasteField<string[]>;
  colors: PasteField<string[]>;
  /** Centavos inteiros; `null` quando falta, é inválido ou ambíguo. */
  priceCents: PasteField<number | null>;
  /** `null` quando ambíguo ou inválido; ausente vira 1 com `assumed: true`. */
  quantity: PasteField<number | null>;
  issues: PasteIssue[];
  status: PasteDraftStatus;
}

export interface PasteParseOptions {
  /** Categoria de calçado: libera a leitura de tamanho numérico 33-48 (sempre "Confira"). */
  footwearCategory?: boolean;
}

export interface PasteParseResult {
  /** No máximo 100 rascunhos (as primeiras linhas com conteúdo). */
  drafts: PasteDraft[];
  /** Linhas com conteúdo no texto colado (pode ser > 100). */
  totalLines: number;
  /** `true` quando `totalLines` > 100: o app mostra "Cole até 100 linhas por vez" e "Usar as 100 primeiras". */
  overLimit: boolean;
}

export interface PasteGroupSuggestion {
  /** Nome comum (da primeira linha do grupo). */
  name: string;
  /** Números de linha (`PasteDraft.line`) que seriam juntados. */
  lines: number[];
  variants: { line: number; sizes: string[]; colors: string[]; priceCents: number | null }[];
  /** `per_variant` quando os preços diferem (WB-374 C5). */
  priceMode: 'single' | 'per_variant';
}
