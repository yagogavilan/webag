import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import CustomerHome from '../app/(customer)/(tabs)/index';
import { ApiError } from '../src/api/problem';
import { addressStore } from '../src/features/address/store';
import { modeStore } from '../src/features/catalog/queries';
import { cartActions } from '../src/features/cart/store';
import { categories, homeData, productCard, seedAddress, storeCard } from '../src/test/fixtures';
import { renderScreen } from '../src/test/render';

const router = (jest.requireMock('expo-router') as { __router: { push: jest.Mock } }).__router;

const mockHome = jest.fn();
const mockCategories = jest.fn();
const mockBanners = jest.fn();
jest.mock('../src/api/catalog-api', () => ({
  fetchHome: (...a: unknown[]) => mockHome(...a),
  fetchCategories: () => mockCategories(),
  fetchBanners: (...a: unknown[]) => mockBanners(...a),
}));
jest.mock('../src/api/auth-api', () => ({ fetchRegions: jest.fn(async () => ({ data: [{ id: 'c1', name: 'Francisco Morato', state: 'SP', slug: 'fm', neighborhoods: [] }], nextCursor: null })) }));

const banner = (over = {}) => ({
  id: 'b1', title: 'Moda de verão na sua região', image: { urls: { '800': 'https://img.test/b1.webp' } }, destination: { type: 'store', id: 's9', code: null }, position: 1, ...over,
});

beforeEach(async () => {
  jest.clearAllMocks();
  await seedAddress('full');
  await modeStore.reset();
  await cartActions.clear();
  mockHome.mockResolvedValue(homeData());
  mockCategories.mockResolvedValue(categories());
  mockBanners.mockResolvedValue({ data: [banner()], nextCursor: null });
});

describe('Início (D5)', () => {
  it('mostra skeleton enquanto carrega e depois as seções', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockHome.mockReturnValue(new Promise((r) => (release = r)));
    await renderScreen(<CustomerHome />);
    expect(await screen.findByTestId('home.skeleton')).toBeOnTheScreen();
    expect(screen.getByTestId('home.address')).toBeOnTheScreen();
    await act(async () => release(homeData()));
    expect(await screen.findByTestId('home.store-s1')).toBeOnTheScreen();
    expect(screen.queryByTestId('home.skeleton')).toBeNull();
  });

  it('banners, categorias, lojas perto e ofertas; seção sem itens não aparece', async () => {
    await renderScreen(<CustomerHome />);
    expect(await screen.findByTestId('home.banner-b1')).toBeOnTheScreen();
    expect(screen.getByTestId('home.category-cat-casa')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Lojas perto de você' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Baixou o preço' })).toBeOnTheScreen();
    expect(screen.getByTestId('home.offer-p1')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Mais vendidos' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Lojas novas' })).toBeNull();
  });

  it('loja com frete, tempo, distância e selos; endereço completo mostra a taxa exata', async () => {
    await renderScreen(<CustomerHome />);
    const row = await screen.findByTestId('home.store-s1');
    // DEC-053: faixa de horário (nunca número único), taxa e distância
    expect(row.props.accessibilityLabel).toMatch(/Chega entre \d{2}:\d{2} e \d{2}:\d{2}/);
    expect(row.props.accessibilityLabel).toContain('Entrega R$ 5,00 · 1,2 km');
    expect(row.props.accessibilityLabel).toContain('Aceita troca');
    expect(row.props.accessibilityLabel).toContain('4,8 de 5, 120 avaliações');
  });

  it('endereço aproximado mostra "a partir de" na taxa', async () => {
    await seedAddress('approx');
    await renderScreen(<CustomerHome />);
    const row = await screen.findByTestId('home.store-s1');
    expect(row.props.accessibilityLabel).toContain('a partir de R$ 5,00');
  });

  it('lojas abertas vêm antes das fechadas, que mostram quando abrem', async () => {
    const closed = storeCard({ id: 's2', name: 'Loja Fechada', open: false, opensAt: new Date(Date.now() + 3600_000).toISOString() });
    mockHome.mockResolvedValue(homeData({ nearbyStores: [closed, storeCard()] }));
    await renderScreen(<CustomerHome />);
    await screen.findByTestId('home.store-s1');
    const ids = screen.getAllByTestId(/^home\.store-/).map((n) => n.props.testID as string);
    expect(ids).toEqual(['home.store-s1', 'home.store-s2']);
    expect(screen.getByTestId('home.store-s2').props.accessibilityLabel).toMatch(/Fechada · abre/);
  });

  it('toque em loja, produto e banner abre as telas certas (link só abre tela)', async () => {
    mockBanners.mockResolvedValue({ data: [banner(), banner({ id: 'b2', destination: { type: 'coupon', id: null, code: 'BEMVINDO10' } })], nextCursor: null });
    await renderScreen(<CustomerHome />);
    await fireEvent.press(await screen.findByTestId('home.store-s1'));
    expect(router.push).toHaveBeenCalledWith('/store/s1');
    await fireEvent.press(screen.getByTestId('home.offer-p1'));
    expect(router.push).toHaveBeenCalledWith('/product/p1');
    await fireEvent.press(screen.getByTestId('home.banner-b1'));
    expect(router.push).toHaveBeenCalledWith('/store/s9');
    await fireEvent.press(screen.getByTestId('home.banner-b2'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/cart', params: { coupon: 'BEMVINDO10' } });
    await fireEvent.press(screen.getByTestId('home.category-cat-calcados'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/results', params: { categoryId: 'cat-calcados', title: 'Calçados' } });
  });

  it('erro parcial: o banner falhou, mas lojas e ofertas aparecem; "Tentar de novo" refaz', async () => {
    mockBanners.mockRejectedValueOnce(new ApiError({ kind: 'server', status: 500 }));
    mockBanners.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<CustomerHome />);
    expect(await screen.findByTestId('home.section-error-banners')).toBeOnTheScreen();
    expect(screen.getByTestId('home.store-s1')).toBeOnTheScreen();
    mockBanners.mockResolvedValue({ data: [banner()], nextCursor: null });
    await fireEvent.press(screen.getAllByRole('button', { name: 'Tentar de novo' })[0]!);
    expect(await screen.findByTestId('home.banner-b1')).toBeOnTheScreen();
  });

  it('erro total mostra o estado de erro com tentar de novo', async () => {
    const fail = new ApiError({ kind: 'server', status: 500 });
    mockHome.mockRejectedValue(fail);
    mockCategories.mockRejectedValue(fail);
    mockBanners.mockRejectedValue(fail);
    await renderScreen(<CustomerHome />);
    expect(await screen.findByText('Não conseguimos carregar agora.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });

  it('sem conexão e sem cache mostra o estado offline', async () => {
    const { useNetworkState } = jest.requireMock('expo-network') as { useNetworkState: jest.Mock };
    useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    const fail = new ApiError({ kind: 'network' });
    mockHome.mockRejectedValue(fail);
    mockCategories.mockRejectedValue(fail);
    mockBanners.mockRejectedValue(fail);
    await renderScreen(<CustomerHome />);
    expect(await screen.findByText('Sem conexão')).toBeOnTheScreen();
    expect(screen.getByTestId('offline-banner')).toBeOnTheScreen();
    useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  });

  it('região sem loja: explica e leva a mudar o endereço', async () => {
    mockHome.mockResolvedValue(homeData({ empty: true, nearbyStores: [], offers: [], availableCategoryIds: [] }));
    await renderScreen(<CustomerHome />);
    expect(await screen.findByText('Ainda não há lojas aqui.')).toBeOnTheScreen();
    expect(screen.queryByTestId('home.category-cat-casa')).toBeNull();
  });

  it('cidade escolhida sem ponto no mapa pede o CEP', async () => {
    await addressStore.clearAll();
    await addressStore.hydrate();
    await addressStore.add({ nickname: null, precision: 'approx', cep: '', street: '', number: '', noNumber: false, complement: '', district: '', city: 'Francisco Morato', state: 'SP', latitude: null, longitude: null });
    await renderScreen(<CustomerHome />);
    expect(await screen.findByTestId('home.no-point')).toBeOnTheScreen();
    expect(mockHome).not.toHaveBeenCalled();
  });

  it('retirada esconde banners e categorias e destaca a distância', async () => {
    await renderScreen(<CustomerHome />);
    await screen.findByTestId('home.store-s1');
    await fireEvent.press(screen.getByTestId('home.mode-pickup'));
    await waitFor(() => expect(mockHome).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'pickup' }), expect.anything()));
    await waitFor(() => expect(screen.queryByTestId('home.banner-b1')).toBeNull());
    expect(screen.queryByTestId('home.category-cat-casa')).toBeNull();
    expect((await screen.findByTestId('home.store-s1')).props.accessibilityLabel).toContain('1,2 km · Retirada');
    expect(screen.getByTestId('home.address').props.accessibilityLabel).toContain('Retirar perto de');
  });

  it('retirada sem loja: explica e volta para entrega', async () => {
    await modeStore.set('pickup');
    mockHome.mockResolvedValue(homeData({ mode: 'pickup', nearbyStores: [], offers: [] }));
    await renderScreen(<CustomerHome />);
    expect(await screen.findByText('Nenhuma loja com retirada perto de você')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar para entrega' }));
    expect(modeStore.get()).toBe('delivery');
  });

  it('a sacola mostra o contador de itens e descreve no rótulo', async () => {
    await cartActions.add('s1', 'Casa Bela', { productId: 'p1', variantId: 'v-local', name: 'Tênis', variantLabel: null, urls: {}, unitPriceCents: 8990, originalPriceCents: null, quantity: 2, maxQuantity: 5 });
    await renderScreen(<CustomerHome />);
    await screen.findByTestId('home.list');
    expect(await screen.findByLabelText('Abrir sacola, 2 itens')).toBeOnTheScreen();
    expect(await screen.findByTestId('minibag')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home.cart'));
    expect(router.push).toHaveBeenCalledWith('/cart');
  });

  it('numerados em "Mais vendidos" e "Lojas novas" aparecem quando a API manda', async () => {
    mockHome.mockResolvedValue(homeData({ bestSellers: [productCard({ id: 'p7', name: 'Camiseta Lisa' })], newStores: [storeCard({ id: 's8', name: 'Loja Nova' })] }));
    await renderScreen(<CustomerHome />);
    await screen.findByTestId('home.list');
    expect(await screen.findByTestId('home.bestseller-p7')).toBeOnTheScreen();
    expect(screen.getByTestId('home.new-store-s8')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Mais vendidos' })).toBeOnTheScreen();
  });
});
