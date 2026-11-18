import type { Category, CategoryNode } from '@webag/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchBanners, fetchCategories, fetchHome, fetchProduct, fetchProductReviews, fetchStore, fetchStoreProducts, fetchStoreReviews } from '../../api/catalog-api';
import { fetchRegions } from '../../api/auth-api';
import { createPersistedStore } from '../../lib/persisted-store';
import { findActiveCity } from '../address/regions';
import { useCurrentAddress } from '../address/store';

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

export function useHomeQuery(point: DeliveryPoint | null, mode: HomeMode) {
  return useQuery({
    queryKey: ['home', point ? roundPoint(point.lat) : null, point ? roundPoint(point.lng) : null, mode],
    queryFn: ({ signal }) => fetchHome({ lat: point?.lat ?? 0, lng: point?.lng ?? 0, mode }, signal),
    enabled: point !== null,
    staleTime: 60_000,
  });
}

export function useCategoriesQuery() {
  return useQuery({ queryKey: ['categories'], queryFn: fetchCategories, staleTime: 10 * 60_000 });
}

export function useRegionsQuery() {
  return useQuery({ queryKey: ['regions'], queryFn: fetchRegions, staleTime: 10 * 60_000 });
}

/** Banners vigentes da cidade do endereço atual (sem cidade conhecida: os de todas as cidades). */
export function useBannersQuery() {
  const address = useCurrentAddress();
  const regions = useRegionsQuery();
  const cityId = address && regions.data ? findActiveCity(regions.data.data, address.city)?.id : undefined;
  const waitingForCity = address !== null && regions.isLoading;
  return useQuery({
    queryKey: ['banners', cityId ?? null],
    queryFn: () => fetchBanners(cityId),
    enabled: !waitingForCity,
    staleTime: 60_000,
  });
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
