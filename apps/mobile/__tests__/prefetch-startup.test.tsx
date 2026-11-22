import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { addressStore } from '../src/features/address/store';
import { modeStore, prefetchStartup, usePrefetchCatalog } from '../src/features/catalog/queries';
import { categories, homeData, seedAddress } from '../src/test/fixtures';

const mockHome = jest.fn();
const mockCategories = jest.fn();
const mockBanners = jest.fn();
const mockRegions = jest.fn();
const mockStore = jest.fn();
const mockStoreProducts = jest.fn();
const mockProduct = jest.fn();
jest.mock('../src/api/catalog-api', () => ({
  fetchHome: (...a: unknown[]) => mockHome(...a),
  fetchCategories: () => mockCategories(),
  fetchBanners: (...a: unknown[]) => mockBanners(...a),
  fetchStore: (...a: unknown[]) => mockStore(...a),
  fetchStoreProducts: (...a: unknown[]) => mockStoreProducts(...a),
  fetchProduct: (...a: unknown[]) => mockProduct(...a),
}));
jest.mock('../src/api/auth-api', () => ({ fetchRegions: () => mockRegions() }));

const regions = { data: [{ id: 'c1', name: 'Francisco Morato', state: 'SP', slug: 'fm', neighborhoods: [] }], nextCursor: null };

beforeEach(async () => {
  jest.clearAllMocks();
  await addressStore.clearAll();
  await addressStore.hydrate();
  await modeStore.reset();
  mockHome.mockResolvedValue(homeData());
  mockCategories.mockResolvedValue(categories());
  mockBanners.mockResolvedValue({ data: [], nextCursor: null });
  mockRegions.mockResolvedValue(regions);
});

const clients: QueryClient[] = [];
const newClient = () => {
  const c = new QueryClient();
  clients.push(c);
  return c;
};
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('prefetchStartup (abertura do app)', () => {
  it('com endereço atual busca início, categorias, regiões e banners da cidade, uma vez cada, nas chaves que as telas usam', async () => {
    await seedAddress('full');
    const client = newClient();
    prefetchStartup(client);
    await flush();
    await flush();
    expect(mockHome).toHaveBeenCalledTimes(1);
    expect(mockHome.mock.calls[0]?.[0]).toEqual({ lat: -23.28, lng: -46.74, mode: 'delivery' });
    expect(mockCategories).toHaveBeenCalledTimes(1);
    expect(mockRegions).toHaveBeenCalledTimes(1);
    expect(mockBanners).toHaveBeenCalledWith('c1');
    expect(client.getQueryData(['home', -23.28, -46.74, 'delivery'])).toBeDefined();
    expect(client.getQueryData(['categories'])).toBeDefined();
    expect(client.getQueryData(['banners', 'c1'])).toBeDefined();
  });

  it('respeita o modo salvo (retirada)', async () => {
    await seedAddress('full');
    await modeStore.set('pickup');
    prefetchStartup(newClient());
    await flush();
    expect(mockHome.mock.calls[0]?.[0]).toMatchObject({ mode: 'pickup' });
  });

  it('sem endereço atual (1ª abertura) não faz nenhuma requisição', async () => {
    prefetchStartup(newClient());
    await flush();
    expect(mockHome).not.toHaveBeenCalled();
    expect(mockCategories).not.toHaveBeenCalled();
    expect(mockRegions).not.toHaveBeenCalled();
  });

  it('falha de rede no prefetch é engolida (a tela refaz a leitura e mostra os estados de erro)', async () => {
    await seedAddress('full');
    mockHome.mockRejectedValue(new Error('rede'));
    mockRegions.mockRejectedValue(new Error('rede'));
    const client = newClient();
    expect(() => prefetchStartup(client)).not.toThrow();
    await flush();
    await flush();
    expect(mockBanners).toHaveBeenCalledWith(undefined);
  });
});

describe('usePrefetchCatalog (toque em loja ou produto)', () => {
  it('onPressIn busca loja, 1ª página de produtos e produto nas chaves das telas, sem duplicar toque repetido', async () => {
    await seedAddress('full');
    const client = newClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => usePrefetchCatalog(), { wrapper });
    mockStore.mockResolvedValue({ id: 's1' });
    mockStoreProducts.mockResolvedValue({ data: [], nextCursor: null });
    mockProduct.mockResolvedValue({ id: 'p1' });
    result.current.store('s1');
    result.current.store('s1');
    result.current.product('p1');
    await flush();
    expect(mockStore).toHaveBeenCalledTimes(1);
    expect(mockStore).toHaveBeenCalledWith('s1', { lat: -23.28, lng: -46.74 });
    expect(mockStoreProducts).toHaveBeenCalledTimes(1);
    expect(mockStoreProducts.mock.calls[0]?.[0]).toBe('s1');
    expect(mockProduct).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['store', 's1', -23.28, -46.74])).toBeDefined();
    expect(client.getQueryData(['product', 'p1'])).toBeDefined();
    expect(client.getQueryData(['store-products', 's1', null])).toBeDefined();
  });
});
