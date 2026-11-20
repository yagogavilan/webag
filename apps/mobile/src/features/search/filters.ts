import type { SearchProductsParams, SearchStoresParams } from '@webag/shared';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';

/** Filtros do design (D7): categoria, preço, distância, avaliação, entrega grátis e aceita troca. */
export interface Filters {
  /** A API aceita UMA categoria por busca (o design previa várias: pendência registrada). */
  categoryId: string | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  maxDistanceKm: number | null;
  minRating: number | null;
  freeShipping: boolean;
  acceptsExchange: boolean;
}

export const NO_FILTERS: Filters = {
  categoryId: null,
  minPriceCents: null,
  maxPriceCents: null,
  maxDistanceKm: null,
  minRating: null,
  freeShipping: false,
  acceptsExchange: false,
};

export const DISTANCES_KM = [1, 3, 5, 10] as const;
export const RATINGS = [3, 4] as const;

export type ProductSort = NonNullable<SearchProductsParams['sort']>;
export type StoreSort = NonNullable<SearchStoresParams['sort']>;

export const PRODUCT_SORTS: readonly ProductSort[] = ['relevance', 'price_asc', 'distance', 'rating'];
export const STORE_SORTS: readonly StoreSort[] = ['relevance', 'distance', 'rating', 'fee'];

export function sortLabel(sort: ProductSort | StoreSort): string {
  switch (sort) {
    case 'price_asc':
      return t('results.sortPrice');
    case 'distance':
      return t('results.sortDistance');
    case 'rating':
      return t('results.sortRating');
    case 'discount':
      return t('results.sortDiscount');
    case 'fee':
      return t('results.sortFee');
    default:
      return t('results.sortRelevance');
  }
}

export const hasFilters = (f: Filters): boolean => activeFilterCount(f) > 0;

export function activeFilterCount(f: Filters, opts: { withCategory?: boolean } = {}): number {
  const { withCategory = true } = opts;
  return [
    withCategory && f.categoryId !== null,
    f.minPriceCents !== null || f.maxPriceCents !== null,
    f.maxDistanceKm !== null,
    f.minRating !== null,
    f.freeShipping,
    f.acceptsExchange,
  ].filter(Boolean).length;
}

interface Position {
  lat: number;
  lng: number;
}

type Common = { q?: string; categoryId?: string; maxDistanceKm?: number; minRating?: number; freeShipping?: 'true'; acceptsExchange?: 'true' };

function common(f: Filters, q: string | undefined): Common {
  return {
    ...(q ? { q } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.maxDistanceKm !== null ? { maxDistanceKm: f.maxDistanceKm } : {}),
    ...(f.minRating !== null ? { minRating: f.minRating } : {}),
    ...(f.freeShipping ? { freeShipping: 'true' as const } : {}),
    ...(f.acceptsExchange ? { acceptsExchange: 'true' as const } : {}),
  };
}

export function toProductParams(p: Position, f: Filters, q: string | undefined, sort: ProductSort, cursor?: string): SearchProductsParams {
  return {
    lat: p.lat,
    lng: p.lng,
    ...common(f, q),
    ...(f.minPriceCents !== null ? { minPriceCents: f.minPriceCents } : {}),
    ...(f.maxPriceCents !== null ? { maxPriceCents: f.maxPriceCents } : {}),
    sort,
    limit: 20,
    ...(cursor ? { cursor } : {}),
  };
}

/** Loja não filtra por preço de produto: só os demais critérios. */
export function toStoreParams(p: Position, f: Filters, q: string | undefined, sort: StoreSort, cursor?: string): SearchStoresParams {
  return { lat: p.lat, lng: p.lng, ...common(f, q), sort, limit: 20, ...(cursor ? { cursor } : {}) };
}

/** "12,50" ou "12" em reais -> centavos. Vazio ou inválido: null. */
export function parseMoneyToCents(text: string): number | null {
  const clean = text.replace(/[^\d,]/g, '');
  if (!clean) return null;
  const [whole = '', frac = ''] = clean.split(',');
  const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return Number.isFinite(cents) ? cents : null;
}

export const centsToField = (cents: number | null): string => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','));

/** Mínimo maior que o máximo: o filtro não aplica (D7 mensagem). */
export const priceRangeInvalid = (min: number | null, max: number | null): boolean => min !== null && max !== null && min > max;

export interface FilterChip {
  id: string;
  label: string;
  remove: (f: Filters) => Filters;
}

/** Chips dos filtros ativos, cada um com o "x" que o remove. A categoria vira chip só fora da tela de categoria. */
export function activeChips(f: Filters, categoryName: (id: string) => string | undefined, opts: { withCategory?: boolean } = {}): FilterChip[] {
  const chips: FilterChip[] = [];
  if (opts.withCategory !== false && f.categoryId) chips.push({ id: 'category', label: categoryName(f.categoryId) ?? t('filters.category'), remove: (x) => ({ ...x, categoryId: null }) });
  if (f.minPriceCents !== null || f.maxPriceCents !== null) {
    const range = f.minPriceCents !== null && f.maxPriceCents !== null ? `${formatMoney(f.minPriceCents)} a ${formatMoney(f.maxPriceCents)}` : f.minPriceCents !== null ? `a partir de ${formatMoney(f.minPriceCents)}` : `até ${formatMoney(f.maxPriceCents ?? 0)}`;
    chips.push({ id: 'price', label: t('filters.chipPrice', { range }), remove: (x) => ({ ...x, minPriceCents: null, maxPriceCents: null }) });
  }
  if (f.maxDistanceKm !== null) chips.push({ id: 'distance', label: t('filters.chipDistance', { km: f.maxDistanceKm }), remove: (x) => ({ ...x, maxDistanceKm: null }) });
  if (f.minRating !== null) chips.push({ id: 'rating', label: t('filters.chipRating', { n: f.minRating }), remove: (x) => ({ ...x, minRating: null }) });
  if (f.freeShipping) chips.push({ id: 'free', label: t('filters.freeDelivery'), remove: (x) => ({ ...x, freeShipping: false }) });
  if (f.acceptsExchange) chips.push({ id: 'exchange', label: t('filters.acceptsExchange'), remove: (x) => ({ ...x, acceptsExchange: false }) });
  return chips;
}
