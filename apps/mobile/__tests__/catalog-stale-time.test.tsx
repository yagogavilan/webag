import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { createQueryClient } from '../src/api/query-client';
import {
  homeOptions,
  productOptions,
  STALE_TIME,
  storeOptions,
  storeProductsOptions,
  useHomeQuery,
  useProductQuery,
  useStoreQuery,
} from '../src/features/catalog/queries';
import { useRevalidateOnFocus } from '../src/features/catalog/revalidate';
import { homeData } from '../src/test/fixtures';

// BUG-033 / DEC-117: loja, produto e vitrine revalidam em até 5 s (a moderação some da tela); home e listas 60 s; busca 30 s.

const mockHome = jest.fn();
const mockStore = jest.fn();
const mockStoreProducts = jest.fn();
const mockProduct = jest.fn();
jest.mock('../src/api/catalog-api', () => ({
  fetchHome: (...a: unknown[]) => mockHome(...a),
  fetchCategories: jest.fn(),
  fetchBanners: jest.fn(),
  fetchStore: (...a: unknown[]) => mockStore(...a),
  fetchStoreProducts: (...a: unknown[]) => mockStoreProducts(...a),
  fetchProduct: (...a: unknown[]) => mockProduct(...a),
}));
jest.mock('../src/api/auth-api', () => ({ fetchRegions: jest.fn() }));

const clients: QueryClient[] = [];
const newClient = () => {
  const c = createQueryClient();
  clients.push(c);
  return c;
};
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
const flush = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));
const point = { lat: -23.28, lng: -46.74 };
const aged = (ms: number) => ({ updatedAt: Date.now() - ms });

beforeEach(() => {
  jest.clearAllMocks();
  mockHome.mockResolvedValue(homeData());
  mockStore.mockResolvedValue({ id: 's1', name: 'Loja nova' });
  mockStoreProducts.mockResolvedValue({ data: [], nextCursor: null });
  mockProduct.mockResolvedValue({ id: 'p1', name: 'Produto novo', store: { id: 's1' } });
});

describe('staleTime do catálogo (DEC-117)', () => {
  it('fixa os valores: 5 s para loja, produto e vitrine; 60 s para home e listas; 30 s para busca', () => {
    expect(STALE_TIME).toEqual({ moderated: 5_000, list: 60_000, search: 30_000 });
    expect(storeOptions('s1', point).staleTime).toBe(5_000);
    expect(storeProductsOptions('s1', null).staleTime).toBe(5_000);
    expect(productOptions('p1').staleTime).toBe(5_000);
    expect(homeOptions({ ...point, approximate: false }, 'delivery').staleTime).toBe(60_000);
  });

  it('o prazo de 5 s da loja não é engolido por um padrão maior do cliente de queries', () => {
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(60_000);
    expect(storeOptions('s1', point).staleTime).toBeLessThanOrEqual(5_000);
  });

  it('loja com mais de 5 s: ao abrir revalida, mantém o dado antigo na tela (sem skeleton) e troca pelo novo', async () => {
    const client = newClient();
    client.setQueryData(storeOptions('s1', point).queryKey, { id: 's1', name: 'Loja antiga' }, aged(6_000));
    let answer: (v: unknown) => void = () => undefined;
    mockStore.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = await renderHook(() => useStoreQuery('s1', point as never), { wrapper: wrapperFor(client) });
    // resposta ainda a caminho: o dado antigo segue na tela, sem estado de carregamento
    expect(result.current.data).toMatchObject({ name: 'Loja antiga' });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(true);
    answer({ id: 's1', name: 'Loja nova' });
    await waitFor(() => expect(result.current.data).toMatchObject({ name: 'Loja nova' }));
    expect(mockStore).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('loja com menos de 5 s: não pede de novo', async () => {
    const client = newClient();
    client.setQueryData(storeOptions('s1', point).queryKey, { id: 's1', name: 'Loja' }, aged(3_000));
    await renderHook(() => useStoreQuery('s1', point as never), { wrapper: wrapperFor(client) });
    await flush();
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('produto com mais de 5 s revalida; a retirada (404) troca o dado antigo pelo erro', async () => {
    const client = newClient();
    client.setQueryData(['product', 'p1'], { id: 'p1', name: 'Antigo' }, aged(6_000));
    const { result } = await renderHook(() => useProductQuery('p1'), { wrapper: wrapperFor(client) });
    expect(result.current.data).toMatchObject({ name: 'Antigo' });
    await flush();
    expect(mockProduct).toHaveBeenCalledTimes(1);
    expect(result.current.data).toMatchObject({ name: 'Produto novo' });
  });

  it('home com 30 s continua valendo (60 s): sem requisição; com 61 s revalida', async () => {
    const client = newClient();
    const home = { ...point, approximate: false };
    client.setQueryData(homeOptions(home, 'delivery').queryKey, homeData(), aged(30_000));
    await renderHook(() => useHomeQuery(home, 'delivery'), { wrapper: wrapperFor(client) });
    await flush();
    expect(mockHome).not.toHaveBeenCalled();

    const old = newClient();
    old.setQueryData(homeOptions(home, 'delivery').queryKey, homeData(), aged(61_000));
    await renderHook(() => useHomeQuery(home, 'delivery'), { wrapper: wrapperFor(old) });
    await flush();
    expect(mockHome).toHaveBeenCalledTimes(1);
  });
});

describe('useRevalidateOnFocus', () => {
  it('ao voltar à tela revalida só o que passou de 5 s e que está em uso', async () => {
    const client = newClient();
    const keyOld = storeOptions('s1', point).queryKey;
    client.setQueryData(keyOld, { id: 's1', name: 'Loja antiga' }, aged(1_000));
    const { rerender } = await renderHook(
      () => {
        useStoreQuery('s1', point as never);
        useRevalidateOnFocus([['store', 's1']]);
      },
      { wrapper: wrapperFor(client) },
    );
    await flush();
    expect(mockStore).not.toHaveBeenCalled(); // 1ª vez em foco = montagem; dado com 1 s ainda vale
    client.setQueryData(keyOld, { id: 's1', name: 'Loja antiga' }, aged(6_000));
    await rerender({});
    await flush();
    expect(mockStore).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(keyOld)).toMatchObject({ name: 'Loja nova' });
  });
});
