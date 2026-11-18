import type { ProductSummary } from '@/lib/api/catalog';

/** Limites do catálogo (API: `domain/price.ts` e `domain/stock.ts`). */
export const MIN_PRICE_CENTS = 1;
export const MAX_PRICE_CENTS = 9_999_999;
export const MAX_STOCK = 99_999;
export const MAX_PHOTOS = 8;
export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 1000;
export const MAX_VARIANTS = 100;
export const MAX_ATTRIBUTES = 3;
/** Estoque sugerido para produto novo (onda-2 Z-3, configurável pela loja depois). */
export const DEFAULT_STOCK = 10;

/** Menor variante pública com pelo menos `minWidth` px (miniatura leve em rede móvel); senão a maior que existir. */
export function pickImage(urls: Record<string, string> | null | undefined, minWidth: number): string | null {
  if (!urls) return null;
  const widths = Object.keys(urls)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const chosen = widths.find((w) => w >= minWidth) ?? widths.at(-1);
  return chosen === undefined ? null : (urls[String(chosen)] ?? null);
}

/** "De R$ 99,90 por R$ 79,90 · 20% off": arredonda para baixo e some abaixo de 1% (igual à API). */
export function discountPercent(originalCents: number, priceCents: number): number | null {
  if (originalCents <= 0 || priceCents >= originalCents) return null;
  const pct = Math.floor(((originalCents - priceCents) * 100) / originalCents);
  return pct >= 1 ? pct : null;
}

/** Mesma conta da API na ação em massa: porcentagem arredonda, valor soma centavos. */
export function adjustPrice(cents: number, mode: 'percent' | 'amount', value: number): number {
  return mode === 'percent' ? Math.round(cents * (1 + value / 100)) : cents + value;
}

export function stockLabel(product: Pick<ProductSummary, 'availableTotal' | 'variantCount'>): string {
  const total = product.availableTotal.toLocaleString('pt-BR');
  if (product.variantCount > 1) return `${total} em ${product.variantCount} opções`;
  return `${total} em estoque`;
}

/** Texto da moderação que o lojista precisa ver (o status do lojista é separado; só o admin muda este). */
export function moderationLabel(status: ProductSummary['moderationStatus']): string | null {
  if (status === 'review') return 'Em revisão';
  if (status === 'paused') return 'Pausado pelo Webag';
  if (status === 'removed') return 'Removido pelo Webag';
  return null;
}

export const isModeratedOff = (status: ProductSummary['moderationStatus']): boolean => status === 'paused' || status === 'removed';
