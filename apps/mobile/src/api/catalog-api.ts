import {
  addFavoriteProduct,
  addFavoriteStore,
  clearSearchHistory,
  getBrowseProduct,
  getBrowseStore,
  getHome,
  getSearchSuggestions,
  listBanners,
  listBrowseProductReviews,
  listBrowseStoreProducts,
  listBrowseStoreReviews,
  listCategories,
  listFavorites,
  listSearchHistory,
  recordSearchTerm,
  removeFavoriteProduct,
  removeFavoriteStore,
  searchProducts,
  searchStores,
  type GetHomeParams,
  type ListFavoritesKind,
  type SearchProductsParams,
  type SearchStoresParams,
} from '@webag/shared';
import { request } from './http';

/** Descoberta e catálogo: tudo público (sem login), exceto favoritos e histórico. Leituras repetem com backoff (rede ruim é o padrão). */
const PUBLIC = { auth: 'none', retry: true } as const;

export const fetchHome = (params: GetHomeParams, signal?: AbortSignal) =>
  request((init) => getHome(params, init), { ...PUBLIC, ...(signal ? { signal } : {}) });

export const fetchCategories = () => request((init) => listCategories(init), PUBLIC);

export const fetchBanners = (cityId?: string) =>
  request((init) => listBanners(cityId ? { cityId } : undefined, init), PUBLIC);

export const fetchSearchProducts = (params: SearchProductsParams, signal?: AbortSignal) =>
  request((init) => searchProducts(params, init), { ...PUBLIC, ...(signal ? { signal } : {}) });

export const fetchSearchStores = (params: SearchStoresParams, signal?: AbortSignal) =>
  request((init) => searchStores(params, init), { ...PUBLIC, ...(signal ? { signal } : {}) });

export const fetchSuggestions = (params: { lat: number; lng: number; q: string }, signal?: AbortSignal) =>
  request((init) => getSearchSuggestions(params, init), { auth: 'none', ...(signal ? { signal } : {}) });

export const fetchStore = (storeId: string, position?: { lat: number; lng: number }) =>
  request((init) => getBrowseStore(storeId, position, init), PUBLIC);

export const fetchStoreProducts = (storeId: string, params: { sectionId?: string; cursor?: string; limit?: number }) =>
  request((init) => listBrowseStoreProducts(storeId, params, init), PUBLIC);

export const fetchStoreReviews = (storeId: string, cursor?: string) =>
  request((init) => listBrowseStoreReviews(storeId, { limit: 10, ...(cursor ? { cursor } : {}) }, init), PUBLIC);

export const fetchProduct = (productId: string) => request((init) => getBrowseProduct(productId, init), PUBLIC);

export const fetchProductReviews = (productId: string, cursor?: string) =>
  request((init) => listBrowseProductReviews(productId, { limit: 10, ...(cursor ? { cursor } : {}) }, init), PUBLIC);

// ---- Favoritos e histórico da conta (exigem login) ----

export const fetchFavorites = (params: { kind?: ListFavoritesKind; cursor?: string; limit?: number }) =>
  request((init) => listFavorites(params, init), { retry: true });

export const setFavoriteStore = (storeId: string, on: boolean) =>
  request((init) => (on ? addFavoriteStore(storeId, init) : removeFavoriteStore(storeId, init)), { retry: true });

export const setFavoriteProduct = (productId: string, on: boolean) =>
  request((init) => (on ? addFavoriteProduct(productId, init) : removeFavoriteProduct(productId, init)), { retry: true });

export const fetchSearchHistory = () => request((init) => listSearchHistory(init), { retry: true });

export const saveSearchTerm = (term: string) => request((init) => recordSearchTerm({ term }, init));

export const wipeSearchHistory = () => request((init) => clearSearchHistory(init));
