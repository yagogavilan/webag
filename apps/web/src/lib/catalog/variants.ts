import type { ProductVariantView } from '@/lib/api/catalog';
import { MAX_ATTRIBUTES, MAX_STOCK, MAX_VARIANTS, MAX_PRICE_CENTS, MIN_PRICE_CENTS } from './helpers';

/** Variações (onda-2 K3, WB-061): atributos e valores viram uma grade de combinações, cada uma com estoque próprio. */
export type AttrKind = 'size' | 'color' | 'other';

export interface AttrDef {
  /** Identificador local estável (o nome pode ser editado no atributo "Outro"). */
  id: string;
  kind: AttrKind;
  name: string;
  values: string[];
}

export interface GridRow {
  /** Chave canônica da combinação (igual à da API: sem diferenciar caixa nem espaços). */
  key: string;
  /** Id da variação já existente no servidor; some para linhas novas. */
  id?: string;
  attributes: Record<string, string>;
  stock: number;
  /** Preço próprio em texto ("79,90"); vazio usa o preço do produto. */
  priceText: string;
  sku: string;
  /** A linha mostra os campos de preço e código. */
  showPrice: boolean;
  /** Unidades reservadas em pedidos (só leitura; o mínimo de estoque). */
  reserved: number;
}

export const SIZE_SHORTCUTS = ['P', 'M', 'G', 'GG', '34', '36', '38', '40', '42', '44'] as const;
export const COLOR_SHORTCUTS = ['Preto', 'Branco', 'Cinza', 'Azul', 'Vermelho', 'Verde', 'Amarelo', 'Rosa', 'Marrom', 'Bege'] as const;
/** Amostra da cor é conteúdo do produto (onda-2 K3), não token da interface. */
export const COLOR_SWATCH: Record<string, string> = {
  preto: '#111111',
  branco: '#ffffff',
  cinza: '#9ca3af',
  azul: '#2563eb',
  vermelho: '#dc2626',
  verde: '#16a34a',
  amarelo: '#facc15',
  rosa: '#ec4899',
  marrom: '#7c4a21',
  bege: '#d9c3a0',
};

const KIND_NAME: Record<Exclude<AttrKind, 'other'>, string> = { size: 'Tamanho', color: 'Cor' };

export const norm = (value: string): string => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Chave canônica da combinação (espelha `attributesKey` da API). */
export function rowKey(attributes: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(attributes)
      .map(([name, value]) => [norm(name), norm(value)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function kindOf(name: string): AttrKind {
  const key = norm(name);
  return key === 'tamanho' ? 'size' : key === 'cor' ? 'color' : 'other';
}

export function newAttr(kind: AttrKind, name = ''): AttrDef {
  return { id: `${kind}-${Math.random().toString(36).slice(2, 8)}`, kind, name: kind === 'other' ? name : KIND_NAME[kind], values: [] };
}

/** "M · Preto". */
export function rowLabel(attributes: Record<string, string>, order: string[] = Object.keys(attributes)): string {
  return order.map((name) => attributes[name]).filter((value): value is string => Boolean(value)).join(' · ');
}

/** Produto cartesiano dos valores (4 tamanhos x 3 cores = 12). Atributo sem nome ou sem valor não entra. */
export function combinations(attrs: AttrDef[]): Record<string, string>[] {
  const usable = attrs.filter((attr) => attr.name.trim() !== '' && attr.values.length > 0);
  if (usable.length === 0) return [];
  return usable.reduce<Record<string, string>[]>((acc, attr) => acc.flatMap((base) => attr.values.map((value) => ({ ...base, [attr.name.trim()]: value }))), [{}]);
}

/**
 * Regera a grade mantendo o que o lojista já preencheu (estoque, preço, código) para as combinações que continuam
 * existindo; combinações novas entram com `defaultStock`. `excluded` guarda as que ele removeu à mão.
 */
export function syncRows(attrs: AttrDef[], previous: GridRow[], defaultStock: number, excluded: ReadonlySet<string>): GridRow[] {
  const byKey = new Map(previous.map((row) => [row.key, row]));
  return combinations(attrs)
    .map((attributes) => ({ attributes, key: rowKey(attributes) }))
    .filter(({ key }) => !excluded.has(key))
    .map(({ attributes, key }): GridRow => byKey.get(key) ?? { key, attributes, stock: defaultStock, priceText: '', sku: '', showPrice: false, reserved: 0 });
}

export function totalStock(rows: GridRow[]): number {
  return rows.reduce((sum, row) => sum + row.stock, 0);
}

/** "12 opções · 96 em estoque" (resumo no topo da grade e no formulário). */
export function variantsSummary(rows: Pick<GridRow, 'stock'>[]): string {
  const count = rows.length;
  const total = rows.reduce((sum, row) => sum + row.stock, 0);
  return `${count} ${count === 1 ? 'opção' : 'opções'} · ${total.toLocaleString('pt-BR')} em estoque`;
}

/** "24 em 6 opções" (formulário do produto). */
export function variantsInline(rows: Pick<GridRow, 'stock'>[]): string {
  const total = rows.reduce((sum, row) => sum + row.stock, 0);
  return `${total.toLocaleString('pt-BR')} em ${rows.length} ${rows.length === 1 ? 'opção' : 'opções'}`;
}

/** Lê o produto do servidor para o editor: atributos na ordem do produto, valores na ordem em que aparecem. */
export function fromServer(names: string[], variants: ProductVariantView[]): { attrs: AttrDef[]; rows: GridRow[] } {
  const attrs = names.map((name): AttrDef => {
    const values: string[] = [];
    for (const variant of variants) {
      const value = variant.attributes[name];
      if (value !== undefined && !values.some((v) => norm(v) === norm(value))) values.push(value);
    }
    const kind = kindOf(name);
    return { id: `${kind}-${norm(name)}`, kind, name, values };
  });
  const rows = variants.map(
    (variant): GridRow => ({
      key: rowKey(variant.attributes),
      id: variant.id,
      attributes: variant.attributes,
      stock: variant.stock,
      priceText: variant.priceCents === null ? '' : (variant.priceCents / 100).toFixed(2).replace('.', ','),
      sku: variant.sku ?? '',
      showPrice: variant.priceCents !== null || Boolean(variant.sku),
      reserved: variant.reserved,
    }),
  );
  return { attrs, rows };
}

export interface RowIssue {
  /** `key` da linha. */
  key: string;
  message: string;
}

/** Problemas por linha e gerais, com as mesmas mensagens da tela K3. */
export function validateGrid(attrs: AttrDef[], rows: GridRow[], parsePrice: (text: string) => number | null): { general: string[]; rows: RowIssue[] } {
  const general: string[] = [];
  const issues: RowIssue[] = [];
  if (attrs.length > MAX_ATTRIBUTES) general.push(`No máximo ${MAX_ATTRIBUTES} atributos.`);
  if (new Set(attrs.map((attr) => norm(attr.name))).size !== attrs.length) general.push('Dois atributos não podem ter o mesmo nome.');
  if (attrs.some((attr) => attr.name.trim() === '')) general.push('Dê um nome ao atributo.');
  if (attrs.some((attr) => attr.values.length === 0)) general.push('Adicione ao menos um valor em cada atributo.');
  if (rows.length > MAX_VARIANTS) general.push(`Máximo de ${MAX_VARIANTS} opções. Você tem ${rows.length}.`);
  if (attrs.length > 0 && rows.length === 0 && general.length === 0) general.push('Adicione ao menos uma opção.');
  const skus = new Map<string, string>();
  for (const row of rows) {
    if (!Number.isInteger(row.stock) || row.stock < 0 || row.stock > MAX_STOCK) issues.push({ key: row.key, message: 'Use só números inteiros, de 0 a 99.999.' });
    else if (row.stock < row.reserved) issues.push({ key: row.key, message: `${row.reserved} ${row.reserved === 1 ? 'unidade está reservada' : 'unidades estão reservadas'} em pedidos. O mínimo é ${row.reserved}.` });
    if (row.priceText.trim() !== '') {
      const cents = parsePrice(row.priceText);
      if (cents === null || cents < MIN_PRICE_CENTS || cents > MAX_PRICE_CENTS) issues.push({ key: row.key, message: 'O preço precisa estar entre R$ 0,01 e R$ 99.999,99.' });
    }
    const sku = row.sku.trim().toLowerCase();
    if (sku) {
      if (skus.has(sku)) issues.push({ key: row.key, message: 'Esse código já está em outra opção.' });
      skus.set(sku, row.key);
    }
  }
  return { general, rows: issues };
}

/** Corpo do `PUT /variants`. Sem atributos: uma única variação sem atributos (produto simples). */
export function toRequest(attrs: AttrDef[], rows: GridRow[], parsePrice: (text: string) => number | null) {
  const names = attrs.map((attr) => attr.name.trim());
  return {
    attributes: names,
    variants: rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      attributes: row.attributes,
      stock: row.stock,
      priceCents: row.priceText.trim() === '' ? null : parsePrice(row.priceText),
      sku: row.sku.trim() === '' ? null : row.sku.trim(),
    })),
  };
}
