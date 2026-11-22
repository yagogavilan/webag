import type { Category, CategoryNode } from '@webag/shared';
import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  fetchBanners,
  fetchCategories,
  fetchHome,
  fetchProduct,
  fetchProductReviews,
  fetchSearchProducts,
  fetchSearchStores,
  fetchStore,
  fetchStoreProducts,
  fetchStoreReviews,
} from '../../api/catalog-api';
import { fetchRegions } from '../../api/auth-api';
import { createPersistedStore } from '../../lib/persisted-store';
import { findActiveCity } from '../address/regions';
import { toProductParams, toStoreParams, type Filters, type ProductSort, type StoreSort } from '../search/filters';
import { addressStore, useCurrentAddress } from '../address/store';

/** Onde o cliente está para a busca por raio: o ponto do endereço atual. Sem ponto (cidade sem coordenada) a descoberta pede o CEP. */
export interface DeliveryPoint {
  lat: number;
  lng: number;
  /** GPS aproximado ou cidade escolhida: taxa vira "a partir de" (onda-3 §0.7). */
  approximate: boolean;
}

export function useDeliveryPoint(): DeliveryPoint | null {
  const address = useCurrentAddress();
  if (!address || address.latitude === null || address.longitude === null) return null;
  return { lat: address.latitude, lng: address.longitude, approximate: address.precision === 'approx' };
}

export type HomeMode = 'delivery' | 'pickup';

/** A escolha Entrega | Retirada persiste entre as aberturas (WB-036). */
export const modeStore = createPersistedStore<HomeMode>('webag.mode.v1', 'delivery', (raw) => (raw === 'pickup' ? 'pickup' : 'delivery'));

const roundPoint = (n: number): number => Math.round(n * 10_000) / 10_000;

// Opções das leituras da abertura: as MESMAS para o hook da tela e para o prefetch (mesma chave = uma só requisição, sem duplicar).
const homeOptions = (point: DeliveryPoint | null, mode: HomeMode) => ({
  queryKey: ['home', point ? roundPoint(point.lat) : null, point ? roundPoint(point.lng) : null, mode] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchHome({ lat: point?.lat ?? 0, lng: point?.lng ?? 0, mode }, signal),
  staleTime: 60_000,
});
const categoriesOptions = { queryKey: ['categories'] as const, queryFn: fetchCategories, staleTime: 10 * 60_000 };
const regionsOptions = { queryKey: ['regions'] as const, queryFn: fetchRegions, staleTime: 10 * 60_000 };
const bannersOptions = (cityId: string | undefined) => ({ queryKey: ['banners', cityId ?? null] as const, queryFn: () => fetchBanners(cityId), staleTime: 60_000 });

export function useHomeQuery(point: DeliveryPoint | null, mode: HomeMode) {
  return useQuery({ ...homeOptions(point, mode), enabled: point !== null });
}

export function useCategoriesQuery() {
  return useQuery(categoriesOptions);
}

export function useRegionsQuery() {
  return useQuery(regionsOptions);
}

/**
 * Começa a buscar o Início enquanto o app ainda carrega fontes e restaura a sessão (a tela só monta depois): sem isto a 1ª requisição
 * só saía depois da 1ª renderização. Só catálogo público (home, categorias, regiões, banners); nada é gravado em disco. Sem endereço
 * atual não faz nada (o visitante cai na escolha de cidade). Falha de rede é ignorada: a tela refaz a leitura com os 4 estados.
 */
export function prefetchStartup(client: QueryClient): void {
  const state = addressStore.getState();
  if (state.status !== 'ready') return;
  const address = state.addresses.find((a) => a.id === state.currentId);
  if (!address) return;
  if (address.latitude !== null && address.longitude !== null) {
    const point: DeliveryPoint = { lat: address.latitude, lng: address.longitude, approximate: address.precision === 'approx' };
    void client.prefetchQuery(homeOptions(point, modeStore.get()));
  }
  void client.prefetchQuery(categoriesOptions);
  void client.prefetchQuery(regionsOptions).then(() => {
    const regions = client.getQueryData<Awaited<ReturnType<typeof fetchRegions>>>(regionsOptions.queryKey);
    const cityId = regions ? findActiveCity(regions.data, address.city)?.id : undefined;
    return client.prefetchQuery(bannersOptions(cityId));
  });
}

/** Banners vigentes da cidade do endereço atual (sem cidade conhecida: os de todas as cidades). */
export function useBannersQuery() {
  const address = useCurrentAddress();
  const regions = useRegionsQuery();
  const cityId = address && regions.data ? findActiveCity(regions.data.data, address.city)?.id : undefined;
  const waitingForCity = address !== null && regions.isLoading;
  return useQuery({ ...bannersOptions(cityId), enabled: !waitingForCity });
}

/** Nome da categoria por id (a API de loja e produto manda só o id). Inclui subcategorias. */
export function useCategoryNames(): { names: ReadonlyMap<string, string>; tree: CategoryNode[]; isLoading: boolean } {
  const query = useCategoriesQuery();
  const tree = query.data?.data;
  return useMemo(() => {
    const names = new Map<string, string>();
    const roots = tree ?? [];
    const walk = (c: Category) => names.set(c.id, c.name);
    roots.forEach((r) => {
      walk(r);
      r.children.forEach(walk);
    });
    return { names, tree: roots, isLoading: query.isLoading };
  }, [tree, query.isLoading]);
}

// ---- Loja e produto ----

export function useStoreQuery(storeId: string | undefined, point: DeliveryPoint | null) {
  return useQuery({
    queryKey: ['store', storeId, point ? roundPoint(point.lat) : null, point ? roundPoint(point.lng) : null],
    queryFn: () => fetchStore(storeId ?? '', point ? { lat: point.lat, lng: point.lng } : undefined),
    enabled: Boolean(storeId),
    staleTime: 60_000,
  });
}

export function useStoreProductsQuery(storeId: string | undefined, sectionId: string | null) {
  return useInfiniteQuery({
    queryKey: ['store-products', storeId, sectionId],
    queryFn: ({ pageParam }) => fetchStoreProducts(storeId ?? '', { limit: 20, ...(sectionId ? { sectionId } : {}), ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(storeId),
    staleTime: 60_000,
  });
}

export function useProductQuery(productId: string | undefined) {
  return useQuery({ queryKey: ['product', productId], queryFn: () => fetchProduct(productId ?? ''), enabled: Boolean(productId), staleTime: 30_000 });
}

export function useReviewsQuery(kind: 'store' | 'product', id: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['reviews', kind, id],
    queryFn: ({ pageParam }) => (kind === 'store' ? fetchStoreReviews(id ?? '', pageParam || undefined) : fetchProductReviews(id ?? '', pageParam || undefined)),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

// ---- Resultados de busca ----

export function useProductResults(point: DeliveryPoint | null, q: string | undefined, filters: Filters, sort: ProductSort, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['search-products', q ?? null, filters, sort, point ? roundPoint(point.lat) : null, point ? roundPoint(point.lng) : null],
    queryFn: ({ pageParam, signal }) => fetchSearchProducts(toProductParams({ lat: point?.lat ?? 0, lng: point?.lng ?? 0 }, filters, q, sort, pageParam || undefined), signal),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && point !== null,
    staleTime: 60_000,
  });
}

export function useStoreResults(point: DeliveryPoint | null, q: string | undefined, filters: Filters, sort: StoreSort, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['search-stores', q ?? null, filters, sort, point ? roundPoint(point.lat) : null, point ? roundPoint(point.lng) : null],
    queryFn: ({ pageParam, signal }) => fetchSearchStores(toStoreParams({ lat: point?.lat ?? 0, lng: point?.lng ?? 0 }, filters, q, sort, pageParam || undefined), signal),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && point !== null,
    staleTime: 60_000,
  });
}
