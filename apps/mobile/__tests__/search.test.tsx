import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import ResultsScreen from '../app/(customer)/results';
import SearchScreen from '../app/(customer)/(tabs)/search';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { pushTerm, searchHistoryStore } from '../src/features/search/history';
import {
  activeChips, activeFilterCount, centsToField, NO_FILTERS, parseMoneyToCents, priceRangeInvalid, toProductParams, toStoreParams,
} from '../src/features/search/filters';
import { categories, productCard, seedAddress, storeCard } from '../src/test/fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock }; useLocalSearchParams: jest.Mock };
const router = expoRouter.__router;

const mockProducts = jest.fn();
const mockStores = jest.fn();
const mockSuggest = jest.fn();
const mockCategories = jest.fn();
const mockSaveTerm = jest.fn();
const mockWipe = jest.fn();
const mockHistory = jest.fn();
jest.mock('../src/api/catalog-api', () => ({
  fetchSearchProducts: (...a: unknown[]) => mockProducts(...a),
  fetchSearchStores: (...a: unknown[]) => mockStores(...a),
  fetchSuggestions: (...a: unknown[]) => mockSuggest(...a),
  fetchCategories: () => mockCategories(),
  fetchSearchHistory: () => mockHistory(),
  saveSearchTerm: (...a: unknown[]) => mockSaveTerm(...a),
  wipeSearchHistory: () => mockWipe(),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await searchHistoryStore.reset();
  await sessionStore.clear();
  await seedAddress('full');
  expoRouter.useLocalSearchParams.mockReturnValue({});
  mockCategories.mockResolvedValue(categories());
  mockProducts.mockReset();
  mockProducts.mockResolvedValue({ data: [productCard()], nextCursor: null });
  mockStores.mockResolvedValue({ data: [storeCard()], nextCursor: null });
  mockSuggest.mockResolvedValue({ products: [{ id: 'p1', name: 'Tênis Corrida Veloz' }], stores: [{ id: 's1', name: 'Casa Bela' }], categories: [{ id: 'cat-calcados', name: 'Calçados' }] });
  mockHistory.mockResolvedValue({ data: [], nextCursor: null });
});

describe('filtros (lógica)', () => {
  it('monta os parâmetros da API só com o que está ativo', () => {
    const f = { ...NO_FILTERS, maxDistanceKm: 3, freeShipping: true, minPriceCents: 1000 };
    expect(toProductParams({ lat: 1, lng: 2 }, f, 'tênis', 'price_asc')).toEqual({ lat: 1, lng: 2, q: 'tênis', maxDistanceKm: 3, freeShipping: 'true', minPriceCents: 1000, sort: 'price_asc', limit: 20 });
    // loja não leva preço
    expect(toStoreParams({ lat: 1, lng: 2 }, f, undefined, 'distance', 'abc')).toEqual({ lat: 1, lng: 2, maxDistanceKm: 3, freeShipping: 'true', sort: 'distance', limit: 20, cursor: 'abc' });
  });

  it('preço em reais vira centavos e valida mínimo maior que máximo', () => {
    expect(parseMoneyToCents('12,50')).toBe(1250);
    expect(parseMoneyToCents('R$ 89')).toBe(8900);
    expect(parseMoneyToCents('')).toBeNull();
    expect(centsToField(8990)).toBe('89,90');
    expect(priceRangeInvalid(5000, 1000)).toBe(true);
    expect(priceRangeInvalid(1000, 5000)).toBe(false);
  });

  it('conta filtros e gera chips removíveis', () => {
    const f = { ...NO_FILTERS, categoryId: 'c', minRating: 4, acceptsExchange: true };
    expect(activeFilterCount(f)).toBe(3);
    expect(activeFilterCount(f, { withCategory: false })).toBe(2);
    const chips = activeChips(f, () => 'Calçados');
    expect(chips.map((c) => c.label)).toEqual(['Calçados', '4+ estrelas', 'Aceita troca']);
    expect(chips[1]?.remove(f).minRating).toBeNull();
  });

  it('histórico: repetido (sem acento e caixa) só volta ao topo; máximo de 10', () => {
    expect(pushTerm(['tênis', 'camisa'], 'TENIS')).toEqual(['TENIS', 'camisa']);
    const full = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(pushTerm(full, 'novo')).toHaveLength(10);
    expect(pushTerm(full, 'novo')[0]).toBe('novo');
  });
});

describe('Busca (D6)', () => {
  it('sem termo: categorias em chips e sem bloco de histórico quando não há histórico', async () => {
    await renderScreen(<SearchScreen />);
    expect(await screen.findByTestId('search.category-cat-casa')).toBeOnTheScreen();
    expect(screen.queryByText('Buscas recentes')).toBeNull();
  });

  it('1 letra avisa; buscar pela tecla grava no histórico e abre os resultados', async () => {
    await renderScreen(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId('search.input'), 't');
    expect(screen.getByText('Digite ao menos 2 letras.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('search.input'), 'tênis');
    await fireEvent(screen.getByTestId('search.input'), 'submitEditing');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/results', params: { q: 'tênis' } }));
    expect(searchHistoryStore.get()).toEqual(['tênis']);
  });

  it('com 2 letras espera 300 ms e mostra sugestões de produto, loja e categoria', async () => {
    await renderScreen(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId('search.input'), 'te');
    expect(mockSuggest).not.toHaveBeenCalled();
    expect(await screen.findByTestId('search.suggestion-p1')).toBeOnTheScreen();
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('search.suggestion-p1').props.accessibilityLabel).toBe('Sugestão 1 de 3: Tênis Corrida Veloz, produto');
    await fireEvent.press(screen.getByTestId('search.suggestion-s1'));
    expect(router.push).toHaveBeenCalledWith('/store/s1');
    await fireEvent.press(screen.getByTestId('search.suggestion-cat-calcados'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/results', params: { categoryId: 'cat-calcados', title: 'Calçados' } });
  });

  it('sugestões com erro avisam e a busca por "Buscar" segue funcionando', async () => {
    mockSuggest.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId('search.input'), 'camisa');
    expect(await screen.findByTestId('search.suggestions-error')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('search.input'), 'submitEditing');
    await waitFor(() => expect(router.push).toHaveBeenCalled());
  });

  it('histórico: toque busca de novo e "Limpar histórico" apaga na hora', async () => {
    await searchHistoryStore.set(['camisa', 'tênis']);
    await renderScreen(<SearchScreen />);
    expect(await screen.findByTestId('search.history-0')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('search.clear-history'));
    expect(await screen.findByText('Histórico apagado.')).toBeOnTheScreen();
    expect(searchHistoryStore.get()).toEqual([]);
    expect(screen.queryByTestId('search.history-0')).toBeNull();
  });

  it('histórico: tocar num termo busca de novo e sobe ao topo', async () => {
    await searchHistoryStore.set(['camisa', 'tênis']);
    await renderScreen(<SearchScreen />);
    await fireEvent.press(await screen.findByTestId('search.history-1'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/results', params: { q: 'tênis' } }));
    expect(searchHistoryStore.get()).toEqual(['tênis', 'camisa']);
  });

  it('logado: grava e apaga o histórico também na conta', async () => {
    await sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });
    mockSaveTerm.mockResolvedValue(undefined);
    mockWipe.mockResolvedValue(undefined);
    mockHistory.mockResolvedValue({ data: [{ term: 'bolsa', searchedAt: '2026-11-10T10:00:00Z' }], nextCursor: null });
    await renderScreen(<SearchScreen />);
    expect(await screen.findByTestId('search.history-0')).toBeOnTheScreen();
    expect(screen.getByText('bolsa')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('search.input'), 'tênis');
    await fireEvent(screen.getByTestId('search.input'), 'submitEditing');
    await waitFor(() => expect(mockSaveTerm).toHaveBeenCalledWith('tênis'));
    await fireEvent.changeText(screen.getByTestId('search.input'), '');
    await fireEvent.press(await screen.findByTestId('search.clear-history'));
    await waitFor(() => expect(mockWipe).toHaveBeenCalled());
  });

  it('SEC-122: o histórico local some quando a sessão acaba', async () => {
    await searchHistoryStore.set(['camisa']);
    await sessionStore.clear('expired');
    expect(searchHistoryStore.get()).toEqual([]);
  });

  it('sem conexão: histórico e categorias seguem; buscar avisa que precisa de internet', async () => {
    const { useNetworkState } = jest.requireMock('expo-network') as { useNetworkState: jest.Mock };
    useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await renderScreen(<SearchScreen />);
    await fireEvent.changeText(screen.getByTestId('search.input'), 'tênis');
    await fireEvent(screen.getByTestId('search.input'), 'submitEditing');
    expect(await screen.findByText('Sem conexão. A busca precisa de internet.')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
    useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  });
});

describe('Resultados e filtros (D7)', () => {
  beforeEach(() => expoRouter.useLocalSearchParams.mockReturnValue({ q: 'tênis' }));

  it('skeleton, depois produtos em grade com a loja; aba Lojas lista as lojas', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockProducts.mockReturnValue(new Promise((r) => (release = r)));
    await renderScreen(<ResultsScreen />);
    expect(await screen.findByTestId('results.skeleton')).toBeOnTheScreen();
    await act(async () => release({ data: [productCard()], nextCursor: null }));
    expect(await screen.findByTestId('results.product-p1')).toBeOnTheScreen();
    expect(screen.getByTestId('results.product-p1').props.accessibilityLabel).toContain('na loja Casa Bela');
    expect(screen.getByRole('tab', { name: 'Produtos (1)' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('results.tab-stores'));
    expect(await screen.findByTestId('results.store-s1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('results.store-s1'));
    expect(router.push).toHaveBeenCalledWith('/store/s1');
  });

  it('pagina de 20 em 20: ao chegar ao fim pede a próxima página com o cursor', async () => {
    mockProducts.mockResolvedValueOnce({ data: [productCard({ id: 'a' })], nextCursor: 'c2' });
    mockProducts.mockResolvedValueOnce({ data: [productCard({ id: 'b' })], nextCursor: null });
    await renderScreen(<ResultsScreen />);
    await screen.findByTestId('results.product-a');
    expect(mockProducts.mock.calls[0]?.[0]).toMatchObject({ q: 'tênis', limit: 20 });
    // o contrato de paginação: a 2ª página leva o cursor da 1ª
    expect(screen.queryByTestId('results.product-b')).toBeNull();
    await fireEvent(screen.getByTestId('results.list'), 'endReached');
    expect(await screen.findByTestId('results.product-b')).toBeOnTheScreen();
    expect(mockProducts.mock.calls[1]?.[0]).toMatchObject({ cursor: 'c2', limit: 20 });
    expect(screen.getByTestId('results.product-a')).toBeOnTheScreen();
  });

  it('aplica filtros pela folha e mostra o contador e os chips com "x"', async () => {
    await renderScreen(<ResultsScreen />);
    await screen.findByTestId('results.product-p1');
    await fireEvent.press(screen.getByTestId('results.filters'));
    await fireEvent.press(await screen.findByTestId('filters.distance-3'));
    await fireEvent(screen.getByTestId('filters.free-delivery'), 'valueChange', true);
    await fireEvent.changeText(screen.getByTestId('filters.price-max'), '100');
    await fireEvent.press(screen.getByTestId('filters.apply'));
    await waitFor(() => expect(mockProducts).toHaveBeenLastCalledWith(expect.objectContaining({ maxDistanceKm: 3, freeShipping: 'true', maxPriceCents: 10000 }), expect.anything()));
    expect(await screen.findByLabelText('Filtros, 3 ativos')).toBeOnTheScreen();
    expect(screen.getByLabelText('Remover filtro Entrega grátis')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Remover filtro Entrega grátis'));
    await waitFor(() => expect(mockProducts).toHaveBeenLastCalledWith(expect.not.objectContaining({ freeShipping: 'true' }), expect.anything()));
  });

  it('preço mínimo maior que o máximo: mensagem no campo e o filtro não aplica', async () => {
    await renderScreen(<ResultsScreen />);
    await screen.findByTestId('results.product-p1');
    await fireEvent.press(screen.getByTestId('results.filters'));
    await fireEvent.changeText(await screen.findByTestId('filters.price-min'), '200');
    await fireEvent.changeText(screen.getByTestId('filters.price-max'), '100');
    expect(screen.getByText('O preço mínimo não pode ser maior que o máximo.')).toBeOnTheScreen();
    const calls = mockProducts.mock.calls.length;
    await fireEvent.press(screen.getByTestId('filters.apply'));
    expect(mockProducts.mock.calls.length).toBe(calls);
  });

  it('ordenar: escolher aplica e fecha; na aba Lojas há "Menor taxa" e não "Menor preço"', async () => {
    await renderScreen(<ResultsScreen />);
    await screen.findByTestId('results.product-p1');
    await fireEvent.press(screen.getByTestId('results.sort'));
    await fireEvent.press(await screen.findByTestId('sort.option-price_asc'));
    await waitFor(() => expect(mockProducts).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'price_asc' }), expect.anything()));
    expect(screen.getByText('Ordenar: Menor preço')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('results.tab-stores'));
    await screen.findByTestId('results.store-s1');
    await fireEvent.press(screen.getByTestId('results.sort'));
    expect(await screen.findByTestId('sort.option-fee')).toBeOnTheScreen();
    expect(screen.queryByTestId('sort.option-price_asc')).toBeNull();
  });

  it('vazio: "Nada para" com próximo passo; com filtro, "Limpar filtros"', async () => {
    mockProducts.mockResolvedValue({ data: [], nextCursor: null });
    await renderScreen(<ResultsScreen />);
    expect(await screen.findByText('Nada para "tênis"')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ver lojas' })).toBeOnTheScreen();
    expect(screen.getByText('Categorias sugeridas')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('results.filters'));
    await fireEvent.press(await screen.findByTestId('filters.rating-4'));
    await fireEvent.press(screen.getByTestId('filters.apply'));
    expect(await screen.findByText('Nenhum resultado com esses filtros.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(mockProducts).toHaveBeenLastCalledWith(expect.not.objectContaining({ minRating: 4 }), expect.anything()));
  });

  it('erro com tentar de novo e offline com a mensagem da busca', async () => {
    mockProducts.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<ResultsScreen />);
    expect(await screen.findByText('Não conseguimos carregar agora.')).toBeOnTheScreen();
    mockProducts.mockResolvedValue({ data: [productCard()], nextCursor: null });
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByTestId('results.product-p1')).toBeOnTheScreen();
  });

  it('categoria: o título é o nome, a categoria não vira chip e o filtro vai à API', async () => {
    expoRouter.useLocalSearchParams.mockReturnValue({ categoryId: 'cat-calcados', title: 'Calçados' });
    await renderScreen(<ResultsScreen />);
    await screen.findByTestId('results.product-p1');
    expect(mockProducts.mock.calls[0]?.[0]).toMatchObject({ categoryId: 'cat-calcados' });
    expect(screen.queryByTestId('results.chip-category')).toBeNull();
    expect(screen.getByText('Calçados')).toBeOnTheScreen();
  });

  it('produto de loja fechada abre, com o selo "Fechada"', async () => {
    mockProducts.mockResolvedValue({ data: [productCard({ store: { id: 's1', name: 'Casa Bela', open: false, opensAt: null, distanceM: 1000 } })], nextCursor: null });
    await renderScreen(<ResultsScreen />);
    const tile = await screen.findByTestId('results.product-p1');
    expect(tile.props.accessibilityLabel).toContain('Fechada');
    await fireEvent.press(tile);
    expect(router.push).toHaveBeenCalledWith('/product/p1');
  });
});
