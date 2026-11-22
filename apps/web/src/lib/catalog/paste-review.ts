import { PASTE_MAX_LINES, parsePastedText, suggestGroups, type PasteDraft, type PasteGroupSuggestion, type PasteParseOptions } from '@webag/shared';
import type { CreateProductDraftsBatchRequest } from '@webag/shared';
import { MAX_PRICE_CENTS, MAX_STOCK, NAME_MAX } from './helpers';
import { parseCents } from '../money';

/**
 * Tabela de revisão do texto colado (WB-376, RN-Q8, DEC-128). O LEITOR é `@webag/shared/paste-parser` (local, determinístico, sem
 * rede e sem IA: o texto só sai do aparelho quando o lojista confirma "Criar rascunhos"). Aqui ficam as regras de tela sobre o que o
 * leitor devolveu: o que ainda pede conferência, "Separar em N linhas", "Juntar", limite de vagas e o corpo do lote.
 */
export { PASTE_MAX_LINES };

/** O que o lojista já conferiu em cada linha ("Conferi" / "Está certo"). */
export type CheckKey = 'size' | 'price' | 'quantity' | 'stock' | 'truncated' | 'sizes';

export interface ReviewVariant {
  size: string | null;
  color: string | null;
  stockText: string;
  priceCents: number | null;
}

export interface ReviewRow {
  /** Estável: `L3` (linha 3) ou `G3` (juntadas, a partir da linha 3). Serve de `clientRef`. */
  id: string;
  lines: number[];
  name: string;
  /** Tamanhos lidos (um por variação). Vazio = produto simples. */
  sizes: string[];
  colors: string[];
  priceText: string;
  quantityText: string;
  /** Juntadas ("Juntar 3 linhas"): uma variação por linha de origem, com preço e estoque próprios. */
  variants: ReviewVariant[] | null;
  checked: CheckKey[];
  /** Estoque que "Separar em 2 linhas" levou só para a última linha (DEC-128 #4). */
  stockMoved: number | null;
  draft: PasteDraft;
}

export type RowStatus = 'ready' | 'confirm' | 'incomplete' | 'multiple_prices';

export interface RowCheck {
  key: CheckKey;
  /** Texto da conferência (pt-BR, spec `v1-1-importar-colar.md` §2). */
  text: string;
  /** "Não é tamanho" devolve o número ao nome. */
  canReject: boolean;
}

export interface ParsedList {
  rows: ReviewRow[];
  groups: PasteGroupSuggestion[];
  totalLines: number;
  overLimit: boolean;
}

const priceText = (cents: number | null): string => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','));

function rowOf(draft: PasteDraft): ReviewRow {
  return {
    id: `L${draft.line}`,
    lines: [draft.line],
    name: draft.name.value ?? '',
    sizes: draft.sizes.value,
    // Só a cor com marcador ("cor azul") sai do nome; a implícita ("camiseta preta") fica no nome (DEC-128 #1).
    colors: draft.colors.confidence === 'high' ? draft.colors.value : [],
    priceText: priceText(draft.priceCents.value),
    quantityText: draft.quantity.value === null ? '' : String(draft.quantity.value),
    variants: null,
    checked: [],
    stockMoved: null,
    draft,
  };
}

/** Lê o texto (local) e devolve as linhas editáveis e as sugestões de "Juntar" (só a mesma cor, DEC-128 #1). */
export function readList(text: string, options: PasteParseOptions = {}): ParsedList {
  const result = parsePastedText(text, options);
  return { rows: result.drafts.map(rowOf), groups: suggestGroups(result.drafts), totalLines: result.totalLines, overLimit: result.overLimit };
}

export function parsePriceCents(text: string): number | null {
  const cents = parseCents(text);
  return cents !== null && cents > 0 && cents <= MAX_PRICE_CENTS ? cents : null;
}

export function parseQty(text: string): number | null {
  const clean = text.trim();
  if (clean === '') return null;
  if (!/^\d{1,5}$/.test(clean)) return null;
  const value = Number(clean);
  return value <= MAX_STOCK ? value : null;
}

/** Problemas que BLOQUEIAM "Publicar" mas não "Criar rascunhos" (todas as linhas viram rascunho, RN-Q2). */
export function rowMessages(row: ReviewRow): { name?: string; price?: string; quantity?: string } {
  const out: { name?: string; price?: string; quantity?: string } = {};
  if (row.name.trim() === '') out.name = 'Falta o nome.';
  else if (row.name.trim().length > NAME_MAX) out.name = 'Use até 80 caracteres.';
  if (row.variants === null) {
    if (row.priceText.trim() === '') out.price = 'Falta o preço.';
    else if (parsePriceCents(row.priceText) === null) out.price = 'Preço inválido: use 79,90.';
    if (parseQty(row.quantityText) === null) out.quantity = 'Quantidade inválida: use um número de 0 a 99.999.';
  } else if (row.variants.some((v) => v.priceCents === null)) {
    out.price = 'Falta o preço.';
  }
  return out;
}

/** Conferências que o leitor pede e o lojista ainda não fez (DEC-128: nunca "Pronta" antes). */
export function rowChecks(row: ReviewRow): RowCheck[] {
  if (row.variants !== null) return [];
  const checks: RowCheck[] = [];
  const done = new Set(row.checked);
  const reasons = row.draft.issues.filter((i): i is Extract<PasteDraft['issues'][number], { code: 'check_field' }> => i.code === 'check_field');
  const size = row.sizes[0];
  if (!done.has('size') && size && row.sizes.length === 1 && reasons.some((i) => i.field === 'sizes')) checks.push({ key: 'size', text: `Lemos ${size} como tamanho. Está certo?`, canReject: true });
  if (!done.has('sizes') && row.sizes.length > 1) checks.push({ key: 'sizes', text: `Lemos ${row.sizes.length} tamanhos (${row.sizes.join(', ')}). Cada um fica com a quantidade ${row.quantityText || '1'}. Está certo?`, canReject: false });
  if (!done.has('price') && reasons.some((i) => i.field === 'price')) {
    const truncated = reasons.some((i) => i.field === 'price' && i.reason === 'line_truncated');
    checks.push({ key: 'price', text: truncated ? 'Confira o preço: a linha foi cortada.' : `Confira o preço: lemos R$ ${row.priceText}.`, canReject: false });
  }
  if (!done.has('quantity') && reasons.some((i) => i.field === 'quantity')) checks.push({ key: 'quantity', text: `Lemos ${row.quantityText} como quantidade. Está certo?`, canReject: false });
  if (!done.has('truncated') && row.draft.issues.some((i) => i.code === 'line_truncated')) checks.push({ key: 'truncated', text: 'Linha cortada em 200 caracteres: confira o nome e o preço.', canReject: false });
  if (!done.has('stock') && row.stockMoved !== null) checks.push({ key: 'stock', text: `O estoque ${row.stockMoved} ficou na última linha. Confira o estoque de cada uma.`, canReject: false });
  return checks;
}

export const hasMultiplePrices = (row: ReviewRow): boolean => row.variants === null && row.priceText === '' && row.draft.issues.some((i) => i.code === 'multiple_prices');

export function rowStatus(row: ReviewRow): RowStatus {
  const messages = rowMessages(row);
  if (hasMultiplePrices(row)) return 'multiple_prices';
  if (messages.name || messages.price || messages.quantity) return 'incomplete';
  return rowChecks(row).length > 0 ? 'confirm' : 'ready';
}

export const STATUS_LABEL: Record<RowStatus, string> = { ready: 'Pronta', confirm: 'Confira', incomplete: 'Com problema', multiple_prices: 'Mais de um preço' };

export function summarize(rows: readonly ReviewRow[]): { total: number; ready: number; confirm: number; problem: number; text: string } {
  let ready = 0;
  let confirm = 0;
  let problem = 0;
  for (const row of rows) {
    const status = rowStatus(row);
    if (status === 'ready') ready += 1;
    else if (status === 'confirm') confirm += 1;
    else problem += 1;
  }
  const total = rows.length;
  const parts = [ready > 0 ? `${ready} ${ready === 1 ? 'pronta' : 'prontas'}` : null, confirm > 0 ? `${confirm} para conferir` : null, problem > 0 ? `${problem} com problema` : null].filter(Boolean);
  return { total, ready, confirm, problem, text: `${total} ${total === 1 ? 'linha lida' : 'linhas lidas'}${parts.length > 0 ? `: ${parts.join(', ')}` : ''}` };
}

/** "Separar em N linhas" (DEC-128 #4): o estoque vai só para a última e o app avisa; o padrão seguro é errar para MENOS estoque. */
export function splitRow(rows: readonly ReviewRow[], id: string): ReviewRow[] {
  const index = rows.findIndex((r) => r.id === id);
  const row = rows[index];
  const issue = row?.draft.issues.find((i): i is Extract<PasteDraft['issues'][number], { code: 'multiple_prices' }> => i.code === 'multiple_prices');
  if (!row || !issue) return [...rows];
  const parsed = parsePastedText(issue.splitLines.join('\n')).drafts;
  const hadStock = parsed.at(-1)?.quantity.assumed === false;
  const stock = hadStock ? (parsed.at(-1)?.quantity.value ?? null) : null;
  const pieces = parsed.map((draft, i): ReviewRow => ({ ...rowOf(draft), id: `${row.id}.${i + 1}`, lines: row.lines, stockMoved: hadStock && stock !== null && parsed.length > 1 ? stock : null }));
  return [...rows.slice(0, index), ...pieces, ...rows.slice(index + 1)];
}

/** "Juntar N linhas em 1 produto com variações" (1 toque; nunca sozinho). Preços diferentes viram preço por variação. */
export function mergeGroup(rows: readonly ReviewRow[], group: PasteGroupSuggestion): ReviewRow[] {
  const members = rows.filter((r) => r.lines.length === 1 && group.lines.includes(r.lines[0] as number) && r.id.startsWith('L') && !r.id.includes('.'));
  if (members.length < 2) return [...rows];
  const first = members[0] as ReviewRow;
  const variants: ReviewVariant[] = members.map((m) => ({ size: m.sizes[0] ?? null, color: m.draft.colors.confidence === 'high' ? (m.colors[0] ?? null) : null, stockText: m.quantityText || '1', priceCents: parsePriceCents(m.priceText) }));
  const merged: ReviewRow = {
    ...first,
    id: `G${first.lines[0]}`,
    lines: members.flatMap((m) => m.lines),
    name: group.name,
    sizes: variants.map((v) => v.size).filter((v): v is string => v !== null),
    priceText: group.priceMode === 'single' ? first.priceText : '',
    variants,
    checked: [],
  };
  const ids = new Set(members.map((m) => m.id));
  const out: ReviewRow[] = [];
  let placed = false;
  for (const row of rows) {
    if (ids.has(row.id)) {
      if (!placed) out.push(merged);
      placed = true;
    } else out.push(row);
  }
  return out;
}

/** Sugestões que ainda valem: todas as linhas do grupo continuam soltas (não foram separadas, juntadas nem recusadas). */
export function liveGroups(rows: readonly ReviewRow[], groups: readonly PasteGroupSuggestion[], dismissed: ReadonlySet<string>): PasteGroupSuggestion[] {
  return groups.filter((g) => {
    const key = g.lines.join(',');
    if (dismissed.has(key)) return false;
    return g.lines.every((line) => rows.some((r) => r.id === `L${line}`));
  });
}

export function groupText(group: PasteGroupSuggestion): string {
  const lines = group.lines;
  const listed = lines.length === 2 ? `${lines[0]} e ${lines[1]}` : `${lines.slice(0, -1).join(', ')} e ${lines.at(-1)}`;
  const sizes = group.variants.map((v) => v.sizes[0] ?? v.colors[0] ?? '').filter(Boolean).join(', ');
  return `As linhas ${listed} parecem o mesmo produto em tamanhos diferentes. Juntar em '${group.name}'${sizes ? ` com tamanhos ${sizes}` : ''}?`;
}

/** Corpo de `createProductDraftsBatch`: nome, preço (nulo = "Falta o preço") e estoque; juntadas e tamanho viram variações. */
export function toBatchRequest(rows: readonly ReviewRow[]): CreateProductDraftsBatchRequest {
  return {
    via: 'paste',
    items: rows.map((row) => {
      const name = row.name.trim().slice(0, NAME_MAX) || 'Sem nome';
      if (row.variants !== null) {
        const hasSize = row.variants.some((v) => v.size);
        const hasColor = row.variants.some((v) => v.color);
        const attributes = [hasSize ? 'Tamanho' : null, hasColor ? 'Cor' : null].filter((a): a is string => a !== null);
        const same = new Set(row.variants.map((v) => v.priceCents)).size === 1;
        return {
          clientRef: row.id,
          name,
          basePriceCents: same ? (row.variants[0]?.priceCents ?? null) : (row.variants.map((v) => v.priceCents).filter((p): p is number => p !== null).sort((a, b) => a - b)[0] ?? null),
          variantAttributes: attributes,
          variants: row.variants.map((v) => ({ attributes: { ...(v.size ? { Tamanho: v.size } : {}), ...(v.color ? { Cor: v.color } : {}) }, stock: parseQty(v.stockText) ?? 1, priceCents: same ? null : v.priceCents })),
        };
      }
      const price = parsePriceCents(row.priceText);
      const quantity = parseQty(row.quantityText) ?? 1;
      if (row.sizes.length > 0 || row.colors.length > 0) {
        const sizes: (string | null)[] = row.sizes.length > 0 ? row.sizes : [null];
        const colors: (string | null)[] = row.colors.length > 0 ? row.colors : [null];
        return {
          clientRef: row.id,
          name,
          basePriceCents: price,
          variantAttributes: [row.sizes.length > 0 ? 'Tamanho' : null, row.colors.length > 0 ? 'Cor' : null].filter((a): a is string => a !== null),
          variants: sizes.flatMap((size) => colors.map((color) => ({ attributes: { ...(size ? { Tamanho: size } : {}), ...(color ? { Cor: color } : {}) }, stock: quantity, priceCents: null }))),
        };
      }
      return { clientRef: row.id, name, basePriceCents: price, quantity };
    }),
  };
}

/** Vagas de rascunho (WB-376 C15): `{ fits, slots }`. Nada é criado em silêncio quando a lista não cabe. */
export function draftSlots(count: number, limit: number, wanted: number): { slots: number; fits: boolean } {
  const slots = Math.max(0, limit - count);
  return { slots, fits: wanted <= slots };
}
