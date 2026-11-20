import type { BrowseVariant } from '@webag/shared';

export type Selection = Readonly<Record<string, string>>;

export interface VariantOption {
  value: string;
  /** Existe alguma combinação COM estoque que inclua esta opção e as outras já escolhidas. */
  available: boolean;
}

export interface VariantGroup {
  name: string;
  options: VariantOption[];
}

const matches = (variant: BrowseVariant, selection: Selection, except?: string): boolean =>
  Object.entries(selection).every(([attr, value]) => attr === except || variant.attributes[attr] === value);

/**
 * Grupos de opções (Tamanho, Cor...) na ordem do contrato. Só combinações com estoque ficam selecionáveis: escolher o tamanho
 * recalcula as cores (onda-3 D9 item 3). Esgotada continua visível, mas inerte e anunciada como "esgotado".
 */
export function buildGroups(attributes: readonly string[], variants: readonly BrowseVariant[], selection: Selection): VariantGroup[] {
  return attributes.map((name) => {
    const values: string[] = [];
    for (const v of variants) {
      const value = v.attributes[name];
      if (value !== undefined && !values.includes(value)) values.push(value);
    }
    return {
      name,
      options: values.map((value) => ({
        value,
        available: variants.some((v) => v.available && v.attributes[name] === value && matches(v, selection, name)),
      })),
    };
  });
}

/** Escolhe uma opção; as escolhas dos outros grupos que deixaram de ter estoque saem (evita combinação impossível). */
export function selectOption(attributes: readonly string[], variants: readonly BrowseVariant[], selection: Selection, name: string, value: string): Selection {
  let next: Record<string, string> = { ...selection, [name]: value };
  for (const group of buildGroups(attributes, variants, next)) {
    if (group.name === name) continue;
    const chosen = next[group.name];
    if (chosen !== undefined && !group.options.find((o) => o.value === chosen)?.available) {
      const { [group.name]: _dropped, ...rest } = next;
      next = rest;
    }
  }
  return next;
}

/** A variação escolhida, só quando todos os atributos estão marcados. */
export function findVariant(attributes: readonly string[], variants: readonly BrowseVariant[], selection: Selection): BrowseVariant | undefined {
  if (attributes.length === 0 || attributes.some((a) => selection[a] === undefined)) return undefined;
  return variants.find((v) => matches(v, selection));
}

export function missingAttributes(attributes: readonly string[], selection: Selection): string[] {
  return attributes.filter((a) => selection[a] === undefined);
}

/** "42 · Preto" (os valores, na ordem dos atributos). */
export function variantLabel(attributes: readonly string[], selection: Selection): string {
  return attributes.map((a) => selection[a]).filter(Boolean).join(' · ');
}

export interface ShownPrice {
  cents: number;
  originalCents: number | null;
  discountPercent: number | null;
  /** Preços diferentes entre as variações e nenhuma escolhida: "A partir de". */
  from: boolean;
}

export function shownPrice(
  product: { price?: { amount: number } | undefined; originalPrice?: { amount: number } | null | undefined; discountPercent?: number | null | undefined },
  variants: readonly BrowseVariant[],
  selected: BrowseVariant | undefined,
): ShownPrice | null {
  if (selected) {
    return { cents: selected.price.amount, originalCents: selected.originalPrice?.amount ?? null, discountPercent: selected.discountPercent, from: false };
  }
  const live = variants.filter((v) => v.available);
  if (live.length > 0) {
    const cheapest = live.reduce((a, b) => (b.price.amount < a.price.amount ? b : a));
    const differs = live.some((v) => v.price.amount !== cheapest.price.amount);
    return { cents: cheapest.price.amount, originalCents: cheapest.originalPrice?.amount ?? null, discountPercent: cheapest.discountPercent, from: differs };
  }
  if (product.price) {
    return { cents: product.price.amount, originalCents: product.originalPrice?.amount ?? null, discountPercent: product.discountPercent ?? null, from: false };
  }
  return null;
}
