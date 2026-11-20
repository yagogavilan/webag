import type { BrowseProduct, BrowseStore, Home, ProductCard, Rating, StoreCard } from '@webag/shared';
import { addressStore } from '../features/address/store';

/** Dados de exemplo no formato do contrato (packages/shared), só para testes. */
export const rating = (average: number | null = 4.8, count = 120): Rating => ({ average, count, isNew: average === null });

export const storeCard = (over: Partial<StoreCard> = {}): StoreCard => ({
  id: 's1',
  name: 'Casa Bela',
  logo: { urls: { '120': 'https://img.test/logo.webp' } },
  mainCategoryId: 'cat-casa',
  open: true,
  opensAt: null,
  distanceM: 1200,
  rating: rating(),
  delivery: { available: true, feeCents: 500, freeShipping: false, freeAboveCents: 0, minOrderCents: 3000, etaMinMinutes: 30, etaMaxMinutes: 45 },
  pickupEnabled: true,
  acceptsExchange: true,
  ...over,
});

export const productCard = (over: Partial<ProductCard> = {}): ProductCard => ({
  id: 'p1',
  name: 'Tênis Corrida Veloz',
  image: { urls: { '400': 'https://img.test/p1.webp' } },
  price: { amount: 8990, currency: 'BRL' },
  originalPrice: { amount: 11990, currency: 'BRL' },
  discountPercent: 25,
  categoryId: 'cat-calcados',
  store: { id: 's1', name: 'Casa Bela', open: true, opensAt: null, distanceM: 1200 },
  ...over,
});

export const homeData = (over: Partial<Home> = {}): Home => ({
  mode: 'delivery',
  empty: false,
  nearbyStores: [storeCard()],
  newStores: [],
  offers: [productCard()],
  bestSellers: [],
  availableCategoryIds: ['cat-casa', 'cat-calcados'],
  ...over,
});

export const categories = () => ({
  data: [
    { id: 'cat-casa', parentId: null, name: 'Casa e utilidades', icon: 'house', position: 1, active: true, createdAt: '', updatedAt: '', children: [] },
    { id: 'cat-calcados', parentId: null, name: 'Calçados', icon: 'sneaker', position: 2, active: true, createdAt: '', updatedAt: '', children: [] },
  ],
  nextCursor: null,
});

export const browseStore = (over: Partial<BrowseStore> = {}): BrowseStore => ({
  id: 's1',
  name: 'Casa Bela',
  description: 'Casa e utilidades',
  logo: { urls: { '120': 'https://img.test/logo.webp' } },
  cover: { urls: { '800': 'https://img.test/cover.webp' } },
  mainCategoryId: 'cat-casa',
  rating: rating(),
  open: true,
  opensAt: null,
  hoursToday: [{ start: '09:00', end: '18:00' }],
  delivery: { available: true, distanceM: 1200, feeCents: 500, freeShipping: false, freeAboveCents: 12000, minOrderCents: 3000, etaMinMinutes: 30, etaMaxMinutes: 45, acceptsDelivery: true },
  pickup: { enabled: true, offered: true, address: 'Rua A, 10', instructions: null, prepMinMinutes: 20, prepMaxMinutes: 30 },
  exchangePolicy: { voluntaryDays: 7, collectionFeeCents: 500, version: 1 },
  supplier: { name: 'Casa Bela Comércio Ltda', documentType: 'cnpj', documentMasked: '12.345.678/****-**', address: { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' } },
  sections: [{ id: 'sec-1', name: 'Camisetas' }],
  ...over,
});

export const browseProduct = (over: Partial<BrowseProduct> = {}): BrowseProduct => ({
  id: 'p1',
  name: 'Tênis Corrida Veloz',
  description: 'Tênis leve para corrida.',
  categoryId: 'cat-calcados',
  available: true,
  unavailableReason: null,
  price: { amount: 8990, currency: 'BRL' },
  originalPrice: { amount: 11990, currency: 'BRL' },
  discountPercent: 25,
  variantAttributes: ['Tamanho'],
  variants: [
    { id: 'v40', attributes: { Tamanho: '40' }, price: { amount: 8990, currency: 'BRL' }, originalPrice: { amount: 11990, currency: 'BRL' }, discountPercent: 25, available: true, maxQuantity: 5, lastUnits: null },
    { id: 'v42', attributes: { Tamanho: '42' }, price: { amount: 8990, currency: 'BRL' }, originalPrice: null, discountPercent: null, available: true, maxQuantity: 2, lastUnits: 2 },
    { id: 'v44', attributes: { Tamanho: '44' }, price: { amount: 8990, currency: 'BRL' }, originalPrice: null, discountPercent: null, available: false, maxQuantity: 0, lastUnits: null },
  ],
  images: [
    { id: 'i1', position: 0, urls: { '800': 'https://img.test/p1-a.webp' } },
    { id: 'i2', position: 1, urls: { '800': 'https://img.test/p1-b.webp' } },
  ],
  rating: rating(4.6, 38),
  store: { id: 's1', name: 'Casa Bela', open: true, opensAt: null, hoursToday: [{ start: '09:00', end: '18:00' }] },
  ...over,
});

/** Endereço atual com ponto, para as telas que dependem de lat/lng. */
export async function seedAddress(precision: 'approx' | 'full' = 'full', remote = false): Promise<void> {
  await addressStore.clearAll();
  await addressStore.hydrate();
  await addressStore.add({
    nickname: null,
    precision,
    cep: precision === 'full' ? '07900000' : '',
    street: precision === 'full' ? 'Rua das Palmeiras' : '',
    number: precision === 'full' ? '120' : '',
    noNumber: false,
    complement: '',
    district: 'Jardim Fortaleza',
    city: 'Francisco Morato',
    state: 'SP',
    latitude: -23.28,
    longitude: -46.74,
    ...(remote ? { remote: true } : {}),
  });
}

const money = (amount: number) => ({ amount, currency: 'BRL' as const });

/** Item da sacola do servidor (`GET /v1/cart`). */
export const serverCartItem = (over: Record<string, unknown> = {}) => ({
  id: 'ci1',
  variantId: 'v40',
  productId: 'p1',
  name: 'Tênis Corrida Veloz',
  attributes: { Tamanho: '40' },
  image: { urls: {} },
  quantity: 2,
  unitPrice: money(8990),
  originalUnitPrice: null,
  lineTotal: money(17980),
  available: true,
  maxQuantity: 5,
  warnings: [],
  ...over,
});

/** Sacola do servidor (resumo coerente com os itens: o app não calcula, só mostra). */
export const serverCart = (over: Record<string, unknown> = {}) => ({
  id: 'cart1',
  revision: 3,
  store: { id: 's1', name: 'Casa Bela', logo: { urls: {} }, open: true, opensAt: null, etaMinMinutes: 30, etaMaxMinutes: 45, minOrder: money(2000) },
  items: [serverCartItem()],
  coupon: null,
  delivery: { mode: 'delivery', addressId: null, available: true, distanceM: 1200, feeFromCents: 500, estimated: false },
  summary: { subtotal: money(17980), delivery: money(500), deliveryEstimated: false, freeShipping: false, serviceFee: money(200), discount: money(0), total: money(18680), minimumTotalApplied: false, platformDiscountCapped: false, missingForMinimum: null },
  checkout: { canCheckout: true, blockers: [], opensAt: null },
  notices: [],
  ...over,
});
