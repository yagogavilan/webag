import { parsePriceToken, type ParsedPrice } from './price.js';
import { cleanLine, hasContent, splitLines } from './sanitize.js';
import {
  COLOR_LABELS,
  COLOR_MODIFIERS,
  COLOR_WORDS,
  FOOTWEAR_WORDS,
  MARKER_WORDS,
  MEASURE_LETTERS_ANY_CASE,
  MEASURE_LETTERS_LOWER_ONLY,
  MEASURE_UNITS,
  PIECE_UNITS,
  PRICE_LABELS,
  QUANTITY_LABELS,
  QUANTITY_UNITS,
  SIZE_LABELS,
  SIZE_SHORTHAND,
  SIZE_SINGLE_WORDS,
  SIZE_WORDS,
  stripAccents,
} from './vocab.js';
import {
  PASTE_MAX_LINES,
  PASTE_NAME_MAX_LENGTH,
  PASTE_PRICE_MAX_CENTS,
  PASTE_QUANTITY_MAX,
  type PasteConfidence,
  type PasteDraft,
  type PasteField,
  type PasteIssue,
  type PasteParseOptions,
  type PasteParseResult,
} from './types.js';

/**
 * Leitor local do texto colado (RN-Q8, ADR-018 D3). Função pura: sem rede, sem eval, sem estado global.
 * Cada linha vira 1 rascunho; o que não dá para ler com segurança fica marcado, nunca adivinhado.
 */

interface Token {
  /** Como aparece na tela (sem marcação do WhatsApp). */
  text: string;
  /** Sem aspas/parênteses/pontuação nas pontas, caixa original. */
  raw: string;
  /** `raw` em minúsculas. */
  probe: string;
  /** Já foi usado por um campo: não entra no nome. */
  consumed: boolean;
  /** Medida ou dimensão: fica no nome e não é classificado. */
  locked: boolean;
}

interface PriceCandidate {
  idx: number;
  parsed: ParsedPrice;
  /** Veio com "R$", "reais" ou "preço": inteiro vale com confiança alta. */
  marked: boolean;
  /** Inteiro solto adotado por exclusão: baixa confiança. */
  guess: boolean;
}

interface QuantityCandidate {
  value: number;
  bare: boolean;
}

interface SizeEntry {
  value: string;
  level: 'high' | 'medium' | 'low';
}

const DIGITS_1_6 = /^\d{1,6}$/;
const INTEGER_1_9 = /^\d{1,9}$/;
const NUMERIC_LIKE = /^\d[\d.,]*$/;
const GLUED_UNIT = /^(\d{1,6})(\D{1,8})$/u;
const NUMBERING = /^\d{1,3}[.)]$/;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const DECIMAL_SEPARATOR = /[.,]/;
const WRAPPER_START = new Set(['(', '[', '{', '"', "'", '“', '‘']);
const WRAPPER_END = new Set([')', ']', '}', '"', "'", '”', '’', '!', '?', '.', ',', ';', ':', '-', '–', '—']);
const WRAPPER_START_EXTRA = new Set(['-', '–', '—']);

function trimWrappers(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end) {
    const ch = value.charAt(start);
    if (WRAPPER_START.has(ch) || WRAPPER_START_EXTRA.has(ch)) start++;
    else break;
  }
  while (end > start && WRAPPER_END.has(value.charAt(end - 1))) end--;
  return value.slice(start, end);
}

function displayText(part: string): string {
  let text = part.replace(/[*~]/g, '');
  if (text.startsWith('_') && !text.startsWith('__')) text = text.slice(1);
  if (text.endsWith('_') && !text.endsWith('__')) text = text.slice(0, -1);
  let end = text.length;
  while (end > 0 && (text.charAt(end - 1) === ',' || text.charAt(end - 1) === ';' || text.charAt(end - 1) === ':')) end--;
  return text.slice(0, end);
}

function makeToken(part: string): Token | null {
  const text = displayText(part);
  // Só pontuação ("-", "|", "•", "/"): separador, some.
  if (!HAS_LETTER_OR_DIGIT.test(text) && !text.includes('$')) return null;
  const raw = trimWrappers(text);
  if (raw === '') return null;
  return { text, raw, probe: raw.toLowerCase(), consumed: false, locked: false };
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  for (const part of line.split(' ')) {
    if (part === '') continue;
    const colon = part.indexOf(':');
    if (colon > 0 && colon < part.length - 1 && MARKER_WORDS.has(part.slice(0, colon).toLowerCase())) {
      for (const piece of [part.slice(0, colon), part.slice(colon + 1)]) {
        const token = makeToken(piece);
        if (token) tokens.push(token);
      }
      continue;
    }
    const token = makeToken(part);
    if (token) tokens.push(token);
  }
  const first = tokens[0];
  if (first && tokens.length > 1 && NUMBERING.test(first.text)) tokens.shift();
  return tokens;
}

function field<T>(value: T, confidence: PasteConfidence, assumed = false): PasteField<T> {
  return { value, confidence, assumed };
}

const LEVEL_ORDER = { high: 2, medium: 1, low: 0 } as const;

function parseLine(line: string, lineNumber: number, lineTruncated: boolean, options: PasteParseOptions): PasteDraft | null {
  const tokens = tokenize(line);
  if (tokens.length === 0) return null;
  const count = tokens.length;

  const at = (i: number): Token | undefined => tokens[i];
  const isFree = (t: Token | undefined): t is Token => t !== undefined && !t.consumed && !t.locked;

  const priceCandidates: PriceCandidate[] = [];
  const quantityCandidates: QuantityCandidate[] = [];
  const sizeEntries: SizeEntry[] = [];
  const sizeTokenIdx = new Set<number>();
  const explicitColors: string[] = [];
  const implicitColors: string[] = [];
  const implicitColorIdx = new Set<number>();

  // ---- helpers de tamanho e cor --------------------------------------------------------------------------------
  const sizeItems = (token: Token, marker: boolean): SizeEntry[] | null => {
    const parts = token.raw.split(/[/-]/);
    if (parts.length > 8) return null;
    const out: SizeEntry[] = [];
    for (const part of parts) {
      if (part === '') return null;
      const upper = part.toUpperCase();
      const exact = part === upper;
      const shorthand = SIZE_SHORTHAND.get(upper);
      if (shorthand) {
        for (const value of shorthand) out.push({ value, level: exact || marker ? 'high' : 'medium' });
      } else if (SIZE_WORDS.has(upper)) {
        out.push({ value: upper, level: exact || marker ? 'high' : 'medium' });
      } else if (marker && SIZE_SINGLE_WORDS.has(upper)) {
        out.push({ value: 'Único', level: 'high' });
      } else if (marker && INTEGER_1_9.test(part) && Number(part) >= 1 && Number(part) <= 60) {
        out.push({ value: String(Number(part)), level: 'low' });
      } else {
        return null;
      }
    }
    return out;
  };

  const colorValue = (token: Token): string[] | null => {
    const out: string[] = [];
    for (const segment of token.probe.split('/')) {
      const words = segment.split('-');
      const head = words[0];
      if (head === undefined || !COLOR_WORDS.has(head)) return null;
      if (!words.every((w) => COLOR_WORDS.has(w) || COLOR_MODIFIERS.has(w))) return null;
      out.push(words.join(' '));
    }
    return out;
  };

  /** Corrida de cores a partir de `start`: "azul marinho", "preto e branco", "preto/branco". Devolve os índices usados. */
  const collectColors = (start: number): { colors: string[]; idxs: number[] } => {
    const colors: string[] = [];
    const idxs: number[] = [];
    let j = start;
    while (j < count) {
      const t = at(j);
      if (!isFree(t)) break;
      const nextToken = at(j + 1);
      if (colors.length > 0 && t.probe === 'e' && isFree(nextToken) && colorValue(nextToken)) {
        idxs.push(j);
        j++;
        continue;
      }
      const lastIdx = idxs[idxs.length - 1];
      if (colors.length > 0 && COLOR_MODIFIERS.has(t.probe) && lastIdx === j - 1) {
        colors[colors.length - 1] = `${colors[colors.length - 1] ?? ''} ${t.probe}`;
        idxs.push(j);
        j++;
        continue;
      }
      if (t.probe === 'off' && isFree(nextToken) && nextToken.probe === 'white') {
        colors.push('off white');
        idxs.push(j, j + 1);
        j += 2;
        continue;
      }
      const value = colorValue(t);
      if (!value) break;
      colors.push(...value);
      idxs.push(j);
      j++;
    }
    return { colors, idxs };
  };

  const collectSizes = (start: number): { items: SizeEntry[]; idxs: number[] } => {
    const items: SizeEntry[] = [];
    const idxs: number[] = [];
    let j = start;
    while (j < count) {
      const t = at(j);
      if (!isFree(t)) break;
      if (items.length > 0 && t.probe === 'e') {
        const nextToken = at(j + 1);
        if (isFree(nextToken) && sizeItems(nextToken, true)) {
          idxs.push(j);
          j++;
          continue;
        }
        break;
      }
      const parsed = sizeItems(t, true);
      if (!parsed) break;
      items.push(...parsed);
      idxs.push(j);
      j++;
      if (parsed.some((p) => p.level === 'low')) break; // tamanho numérico: só um por marcador
    }
    return { items, idxs };
  };

  const consumePriceAt = (j: number, marked: boolean): boolean => {
    const t = at(j);
    if (!isFree(t)) return false;
    const parsed = parsePriceToken(t.probe);
    if (!parsed) return false;
    t.consumed = true;
    priceCandidates.push({ idx: j, parsed, marked, guess: false });
    return true;
  };

  // ---- A: marcadores explícitos (R$, preço, qtd, tam, cor) -----------------------------------------------------
  for (let i = 0; i < count; i++) {
    const t = at(i);
    if (!isFree(t)) continue;
    const p = t.probe;
    if (p === 'r$' || PRICE_LABELS.has(p)) {
      let j = i + 1;
      const maybeCurrency = at(j);
      if (isFree(maybeCurrency) && maybeCurrency.probe === 'r$') j++;
      if (consumePriceAt(j, true)) {
        t.consumed = true;
        if (j === i + 2) {
          const currency = at(i + 1);
          if (currency) currency.consumed = true;
        }
      }
    } else if (p.startsWith('r$') && p.length > 2) {
      const parsed = parsePriceToken(p.slice(2));
      if (parsed) {
        t.consumed = true;
        priceCandidates.push({ idx: i, parsed, marked: true, guess: false });
      }
    } else if (QUANTITY_LABELS.has(p)) {
      const next = at(i + 1);
      if (isFree(next) && DIGITS_1_6.test(next.probe)) {
        t.consumed = true;
        next.consumed = true;
        quantityCandidates.push({ value: Number(next.probe), bare: false });
      }
    } else if (SIZE_LABELS.has(p)) {
      const run = collectSizes(i + 1);
      if (run.items.length > 0) {
        t.consumed = true;
        for (const idx of run.idxs) {
          const used = at(idx);
          if (used) used.consumed = true;
          sizeTokenIdx.add(idx);
        }
        sizeEntries.push(...run.items);
      }
    } else if (COLOR_LABELS.has(p)) {
      const run = collectColors(i + 1);
      if (run.colors.length > 0) {
        t.consumed = true;
        for (const idx of run.idxs) {
          const used = at(idx);
          if (used) used.consumed = true;
        }
        explicitColors.push(...run.colors);
      }
    }
  }

  // ---- B: medidas e dimensões ficam no nome ("45 cm", "1,50 m", "2,00 x 3,00") --------------------------------
  for (let i = 0; i < count; i++) {
    const t = at(i);
    if (!isFree(t) || !NUMERIC_LIKE.test(t.probe)) continue;
    const next = at(i + 1);
    if (!isFree(next)) continue;
    const unit = next.probe;
    const isUnit =
      MEASURE_UNITS.has(unit) ||
      MEASURE_LETTERS_ANY_CASE.has(unit) ||
      (MEASURE_LETTERS_LOWER_ONLY.has(unit) && next.raw === unit);
    if (isUnit) {
      t.locked = true;
      next.locked = true;
      continue;
    }
    if (unit === 'x' || unit === '×') {
      const after = at(i + 2);
      if (isFree(after) && NUMERIC_LIKE.test(after.probe)) {
        const afterDecimal = DECIMAL_SEPARATOR.test(after.probe);
        const bothIntegers = INTEGER_1_9.test(t.probe) && INTEGER_1_9.test(after.probe);
        if (afterDecimal || bothIntegers) {
          t.locked = true;
          next.locked = true;
          after.locked = true;
        }
      }
    }
  }

  // ---- D: preços sem marcador (com vírgula/ponto decimal ou milhar) e "79 reais" -------------------------------
  for (let i = 0; i < count; i++) {
    const t = at(i);
    if (!isFree(t)) continue;
    const parsed = parsePriceToken(t.probe);
    if (!parsed) continue;
    const next = at(i + 1);
    const followedByCurrencyWord = isFree(next) && (next.probe === 'reais' || next.probe === 'real');
    if (parsed.shape === 'integer' && !followedByCurrencyWord) continue;
    t.consumed = true;
    priceCandidates.push({ idx: i, parsed, marked: parsed.shape === 'integer', guess: false });
    if (followedByCurrencyWord && next) next.consumed = true;
  }
  const hasPriceBefore = (i: number): boolean => priceCandidates.some((c) => c.idx < i);

  // ---- C: quantidade ("4 un", "4un", "x4", "x 4", "4 em estoque", "4 peças" depois do preço) -------------------
  for (let i = 0; i < count; i++) {
    const t = at(i);
    if (!isFree(t)) continue;
    const p = t.probe;
    const first = p.charAt(0);
    if ((first === 'x' || first === '×') && p.length >= 2 && DIGITS_1_6.test(p.slice(1))) {
      t.consumed = true;
      quantityCandidates.push({ value: Number(p.slice(1)), bare: false });
      continue;
    }
    if (p === 'x' || p === '×') {
      const next = at(i + 1);
      if (isFree(next) && DIGITS_1_6.test(next.probe)) {
        t.consumed = true;
        next.consumed = true;
        quantityCandidates.push({ value: Number(next.probe), bare: false });
      }
      continue;
    }
    const pieceOk = (): boolean => priceCandidates.length === 0 || hasPriceBefore(i);
    if (DIGITS_1_6.test(p)) {
      const next = at(i + 1);
      if (!isFree(next)) continue;
      if (QUANTITY_UNITS.has(next.probe) || (PIECE_UNITS.has(next.probe) && pieceOk())) {
        t.consumed = true;
        next.consumed = true;
        quantityCandidates.push({ value: Number(p), bare: false });
      } else if (next.probe === 'em') {
        const third = at(i + 2);
        if (isFree(third) && third.probe === 'estoque') {
          t.consumed = true;
          next.consumed = true;
          third.consumed = true;
          quantityCandidates.push({ value: Number(p), bare: false });
        }
      }
      continue;
    }
    const glued = GLUED_UNIT.exec(p);
    if (glued?.[1] && glued[2] && (QUANTITY_UNITS.has(glued[2]) || (PIECE_UNITS.has(glued[2]) && pieceOk()))) {
      t.consumed = true;
      quantityCandidates.push({ value: Number(glued[1]), bare: false });
    }
  }

  // ---- E: tamanhos sem marcador (P, M, G, GG, P/M/G...) --------------------------------------------------------
  for (let i = 0; i < count; i++) {
    const t = at(i);
    if (!isFree(t)) continue;
    const items = sizeItems(t, false);
    if (!items) continue;
    t.consumed = true;
    sizeTokenIdx.add(i);
    sizeEntries.push(...items);
  }
  for (let i = 1; i < count - 1; i++) {
    const t = at(i);
    if (isFree(t) && t.probe === 'e' && sizeTokenIdx.has(i - 1) && sizeTokenIdx.has(i + 1)) t.consumed = true;
  }

  // ---- F: inteiros soltos (tamanho de calçado, preço sem vírgula, estoque sem unidade) -------------------------
  const footwear =
    options.footwearCategory === true || tokens.some((t) => FOOTWEAR_WORDS.has(stripAccents(t.probe)));
  let ints: { idx: number; value: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = at(i);
    if (isFree(t) && INTEGER_1_9.test(t.probe)) ints.push({ idx: i, value: Number(t.probe) });
  }
  if (footwear && sizeEntries.length === 0) {
    const size = ints.find((n) => n.value >= 33 && n.value <= 48);
    if (size) {
      const t = at(size.idx);
      if (t) t.consumed = true;
      sizeEntries.push({ value: String(size.value), level: 'low' });
      ints = ints.filter((n) => n !== size);
    }
  }
  if (priceCandidates.length > 0) {
    const lastPriceIdx = Math.max(...priceCandidates.map((c) => c.idx));
    const after = ints.filter((n) => n.idx > lastPriceIdx && n.value <= 999_999);
    const only = after.length === 1 ? after[0] : undefined;
    if (only && quantityCandidates.length === 0) {
      const t = at(only.idx);
      if (t) t.consumed = true;
      quantityCandidates.push({ value: only.value, bare: true });
    }
  } else if (ints.length === 1 && ints[0]) {
    const only = ints[0];
    const t = at(only.idx);
    if (t) t.consumed = true;
    priceCandidates.push({
      idx: only.idx,
      parsed: { cents: only.value * 100, shape: 'integer', fractionDigits: 0 },
      marked: false,
      guess: true,
    });
  }

  // ---- G: cores sem marcador: ficam no nome, viram sugestão ----------------------------------------------------
  for (let i = 0; i < count; i++) {
    const t = at(i);
    if (!isFree(t)) continue;
    const run = collectColors(i);
    if (run.colors.length === 0) continue;
    implicitColors.push(...run.colors);
    for (const idx of run.idxs) {
      implicitColorIdx.add(idx);
      const used = at(idx);
      if (used) used.consumed = true; // marcado provisoriamente; devolvido ao nome abaixo
    }
  }
  for (const idx of implicitColorIdx) {
    const used = at(idx);
    if (used) used.consumed = false;
  }

  // ---- montagem ------------------------------------------------------------------------------------------------
  const issues: PasteIssue[] = [];

  // nome
  let nameText = tokens
    .filter((t) => !t.consumed)
    .map((t) => t.text)
    .join(' ')
    .trim();
  let baseText = tokens
    .filter((t, i) => !t.consumed && !implicitColorIdx.has(i))
    .map((t) => t.text)
    .join(' ')
    .trim();
  let nameTruncated = false;
  if (nameText.length > PASTE_NAME_MAX_LENGTH) {
    nameText = nameText.slice(0, PASTE_NAME_MAX_LENGTH).trimEnd();
    nameTruncated = true;
  }
  if (baseText.length > PASTE_NAME_MAX_LENGTH) baseText = baseText.slice(0, PASTE_NAME_MAX_LENGTH).trimEnd();
  const hasName = HAS_LETTER_OR_DIGIT.test(nameText);
  if (!hasName) issues.push({ code: 'missing_name', severity: 'blocking' });
  const nameField = hasName
    ? field<string | null>(nameText, nameText.length > 2 ? 'high' : 'low')
    : field<string | null>(null, 'none');
  const baseName = hasName ? (HAS_LETTER_OR_DIGIT.test(baseText) ? baseText : nameText) : null;

  // preço
  const distinctCents = [...new Set(priceCandidates.map((c) => c.parsed.cents))];
  let priceField = field<number | null>(null, 'none');
  if (distinctCents.length === 0) {
    issues.push({ code: 'missing_price', severity: 'blocking' });
  } else if (distinctCents.length > 1) {
    const sorted = [...priceCandidates].sort((a, b) => a.idx - b.idx);
    issues.push({
      code: 'multiple_prices',
      severity: 'confirm',
      candidatesCents: sorted.map((c) => c.parsed.cents).filter((c, i, all) => all.indexOf(c) === i),
      splitLines: buildSplitLines(tokens, sorted),
    });
  } else {
    const chosen = priceCandidates[0];
    if (chosen) {
      const { cents, shape, fractionDigits } = chosen.parsed;
      if (cents <= 0 || cents > PASTE_PRICE_MAX_CENTS) {
        issues.push({ code: 'invalid_price', severity: 'blocking' });
      } else {
        let confidence: PasteConfidence = 'high';
        if (chosen.guess) {
          confidence = 'low';
          issues.push({ code: 'check_field', severity: 'confirm', field: 'price', reason: 'integer_price' });
        } else if (shape === 'thousands') {
          confidence = 'medium';
          issues.push({ code: 'check_field', severity: 'confirm', field: 'price', reason: 'thousands_price' });
        } else if (shape === 'decimal' && fractionDigits === 1) {
          confidence = 'medium';
        }
        // Linha cortada (DEC-128 #3): "R$ 1.299,90" cortado em "R$ 1" lê R$ 1,00. O preço dessa linha nunca é confiável.
        if (lineTruncated) {
          confidence = 'low';
          issues.push({ code: 'check_field', severity: 'confirm', field: 'price', reason: 'line_truncated' });
        }
        priceField = field<number | null>(cents, confidence);
      }
    }
  }

  // quantidade
  let quantityField = field<number | null>(1, 'none', true);
  const distinctQty = [...new Set(quantityCandidates.map((q) => q.value))];
  if (distinctQty.length > 1) {
    quantityField = field<number | null>(null, 'none');
    issues.push({ code: 'multiple_quantities', severity: 'confirm', candidates: distinctQty });
  } else if (distinctQty.length === 1) {
    const value = distinctQty[0] ?? 0;
    if (value > PASTE_QUANTITY_MAX) {
      quantityField = field<number | null>(null, 'none');
      issues.push({ code: 'invalid_quantity', severity: 'blocking' });
    } else if (quantityCandidates.every((q) => q.bare)) {
      quantityField = field<number | null>(value, 'low');
      issues.push({ code: 'check_field', severity: 'confirm', field: 'quantity', reason: 'bare_quantity' });
    } else {
      quantityField = field<number | null>(value, 'high');
    }
  }

  // tamanhos
  const sizeValues: string[] = [];
  let sizeLevel: SizeEntry['level'] = 'high';
  for (const entry of sizeEntries) {
    if (!sizeValues.includes(entry.value)) sizeValues.push(entry.value);
    if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[sizeLevel]) sizeLevel = entry.level;
  }
  const sizesField = field<string[]>(sizeValues, sizeValues.length === 0 ? 'none' : sizeLevel);
  if (sizeValues.length > 1) issues.push({ code: 'multiple_sizes', severity: 'confirm', sizes: sizeValues });
  if (sizeEntries.some((e) => e.level === 'low')) {
    issues.push({ code: 'check_field', severity: 'confirm', field: 'sizes', reason: 'numeric_size' });
  } else if (sizeEntries.some((e) => e.level === 'medium')) {
    issues.push({ code: 'check_field', severity: 'confirm', field: 'sizes', reason: 'lowercase_size' });
  }

  // cores
  const colorValues = [...new Set([...explicitColors, ...implicitColors])];
  const colorsField = field<string[]>(
    colorValues,
    colorValues.length === 0 ? 'none' : implicitColors.length > 0 ? 'low' : 'high',
  );

  if (nameTruncated) issues.push({ code: 'name_truncated', severity: 'confirm' });
  if (lineTruncated) issues.push({ code: 'line_truncated', severity: 'confirm' });

  const status = issues.some((i) => i.severity === 'blocking')
    ? 'incomplete'
    : issues.length > 0
      ? 'confirm'
      : 'ready';

  return {
    line: lineNumber,
    source: line,
    name: nameField,
    baseName,
    sizes: sizesField,
    colors: colorsField,
    priceCents: priceField,
    quantity: quantityField,
    issues,
    status,
  };
}

/**
 * "Separar em N linhas": cada preço fecha uma linha; as palavras que sobram depois do último preço (estoque)
 * ficam na última. Linhas sem nome próprio herdam o nome da primeira ("Bermuda P 49,90 G 59,90").
 */
function buildSplitLines(tokens: Token[], sortedPrices: PriceCandidate[]): string[] {
  const first = sortedPrices[0];
  if (!first) return [];
  const head = tokens
    .slice(0, first.idx + 1)
    .filter((t) => !t.consumed)
    .map((t) => t.text)
    .join(' ');
  const lines: string[] = [];
  let from = 0;
  sortedPrices.forEach((candidate, k) => {
    const isLast = k === sortedPrices.length - 1;
    const segment = tokens.slice(from, isLast ? tokens.length : candidate.idx + 1);
    from = candidate.idx + 1;
    const text = segment.map((t) => t.text).join(' ');
    const hasOwnName = segment.some((t) => !t.consumed);
    lines.push(k === 0 || hasOwnName || head === '' ? text : `${head} ${text}`);
  });
  return lines;
}

export function parsePastedText(input: string, options: PasteParseOptions = {}): PasteParseResult {
  if (typeof input !== 'string' || input === '') return { drafts: [], totalLines: 0, overLimit: false };
  const drafts: PasteDraft[] = [];
  let totalLines = 0;
  const lines = splitLines(input);
  for (let i = 0; i < lines.length; i++) {
    const { text, truncated } = cleanLine(lines[i] ?? '');
    if (!hasContent(text)) continue;
    if (drafts.length < PASTE_MAX_LINES) {
      const draft = parseLine(text, i + 1, truncated, options);
      if (!draft) continue;
      drafts.push(draft);
    }
    totalLines++;
  }
  return { drafts, totalLines, overLimit: totalLines > PASTE_MAX_LINES };
}
