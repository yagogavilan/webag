import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import ReviewsScreen from '../app/(customer)/reviews';
import StoreScreen from '../app/(customer)/store/[id]';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { takePendingFavorite } from '../src/features/favorites/hooks';
import { cartActions } from '../src/features/cart/store';
import { modeStore } from '../src/features/catalog/queries';
import { browseStore, rating, seedAddress } from '../src/test/fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock }; useLocalSearchParams: jest.Mock };
const router = expoRouter.__router;

const mockStore = jest.fn();
const mockProducts = jest.fn();
const mockStoreReviews = jest.fn();
const mockSetFavorite = jest.fn();
const mockServerFavorites = new Set<string>();
jest.mock('../src/api/catalog-api', () => ({
  fetchStore: (...a: unknown[]) => mockStore(...a),
  fetchStoreProducts: (...a: unknown[]) => mockProducts(...a),
  fetchStoreReviews: (...a: unknown[]) => mockStoreReviews(...a),
  fetchFavorites: () =>
    Promise.resolve({ data: [...mockServerFavorites].map((id) => ({ kind: 'store', unavailable: false, favoritedAt: '', store: { id, name: '', logo: { urls: {} } }, product: null })), nextCursor: null }),
  setFavoriteStore: (...a: unknown[]) => mockSetFavorite(...a),
}));

const item = (id: string, over = {}) => ({ id, name: `Produto ${id}`, sectionId: null, image: { urls: { '400': 'https://img.test/x.webp' } }, price: { amount: 5000, currency: 'BRL' }, originalPrice: null, discountPercent: null, available: true, ...over });

beforeEach(async () => {
  jest.clearAllMocks();
  expoRouter.useLocalSearchParams.mockReturnValue({ id: 's1' });
  await seedAddress('full');
  await cartActions.clear();
  await modeStore.reset();
  mockStore.mockResolvedValue(browseStore());
  mockProducts.mockResolvedValue({ data: [item('a'), item('b', { available: false }), item('c')], nextCursor: null });
});

describe('Loja (D8)', () => {
  it('capa, nome, nota, aberta até, taxa e tempo, pedido mínimo e retirada', async () => {
    await renderScreen(<StoreScreen />);
    expect(await screen.findByText('Casa Bela')).toBeOnTheScreen();
    expect(screen.getByTestId('store.rating').props.accessibilityLabel).toContain('4,8 de 5, 120 avaliações');
    expect(screen.getByText('30 a 45 min · R$ 5,00 · 1,2 km')).toBeOnTheScreen();
    expect(screen.getByText('Grátis acima de R$ 120,00')).toBeOnTheScreen();
    expect(screen.getByText('Pedido mínimo R$ 30,00')).toBeOnTheScreen();
    expect(screen.getByText('Retirada em 20 a 30 min')).toBeOnTheScreen();
    expect(screen.getByText('Aceita troca')).toBeOnTheScreen();
  });

  it('produtos disponíveis primeiro, indisponíveis ao final com selo', async () => {
    await renderScreen(<StoreScreen />);
    await screen.findByTestId('store.product-a');
    const ids = screen.getAllByTestId(/^store\.product-/).map((n) => n.props.testID as string);
    expect(ids).toEqual(['store.product-a', 'store.product-c', 'store.product-b']);
    expect(screen.getByTestId('store.product-b').props.accessibilityLabel).toContain('Esgotado');
    await fireEvent.press(screen.getByTestId('store.product-a'));
    expect(router.push).toHaveBeenCalledWith('/product/a');
  });

  it('abas de seção filtram pela API', async () => {
    await renderScreen(<StoreScreen />);
    await fireEvent.press(await screen.findByTestId('store.tab-sec-1'));
    await waitFor(() => expect(mockProducts).toHaveBeenLastCalledWith('s1', expect.objectContaining({ sectionId: 'sec-1' })));
    expect(screen.getByTestId('store.tab-sec-1')).toBeSelected();
  });

  it('loja fechada é navegável e mostra quando abre', async () => {
    mockStore.mockResolvedValue(browseStore({ open: false, opensAt: new Date(Date.now() + 86_400_000).toISOString() }));
    await renderScreen(<StoreScreen />);
    expect(await screen.findByTestId('store.closed-banner')).toBeOnTheScreen();
    expect(screen.getByTestId('store.product-a')).toBeOnTheScreen();
  });

  it('não entrega no endereço: oferece retirar na loja e ativa o modo retirada', async () => {
    mockStore.mockResolvedValue(browseStore({ delivery: { ...browseStore().delivery, available: false, feeCents: null } }));
    await renderScreen(<StoreScreen />);
    expect(await screen.findByText('Não entrega no seu endereço.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retirar na loja' }));
    expect(modeStore.get()).toBe('pickup');
  });

  it('barra "Ver sacola" só aparece com itens desta loja', async () => {
    await cartActions.add('s1', 'Casa Bela', { productId: 'a', variantId: null, name: 'A', variantLabel: null, urls: {}, unitPriceCents: 4500, originalPriceCents: null, quantity: 2, maxQuantity: 9 });
    await renderScreen(<StoreScreen />);
    expect(await screen.findByRole('button', { name: 'Ver sacola, 2 itens, total R$ 90,00' })).toBeOnTheScreen();
  });

  it('política de trocas abre com a taxa de coleta e os direitos do consumidor', async () => {
    await renderScreen(<StoreScreen />);
    await fireEvent.press(await screen.findByTestId('store.exchange-policy'));
    expect(await screen.findByText('Essa loja aceita, em até 7 dias depois de receber. Coleta em casa: R$ 5,00.')).toBeOnTheScreen();
    expect(screen.getByText('Arrependimento: você pode desistir em até 7 dias depois de receber.')).toBeOnTheScreen();
  });

  it('sobre a loja traz o fornecedor com documento mascarado e o aviso de quem vende', async () => {
    await renderScreen(<StoreScreen />);
    await fireEvent.press(await screen.findByTestId('store.about'));
    expect(await screen.findByText('12.345.678/****-**')).toBeOnTheScreen();
    expect(screen.getByText('Quem vende é a loja. O Webag cuida do pagamento e da entrega combinada.')).toBeOnTheScreen();
  });

  it('loja sem produtos mostra o próximo passo', async () => {
    mockProducts.mockResolvedValue({ data: [], nextCursor: null });
    await renderScreen(<StoreScreen />);
    expect(await screen.findByText('Essa loja ainda não tem produtos.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ver outras lojas' })).toBeOnTheScreen();
  });

  it('loja removida (404) tem estado próprio', async () => {
    mockStore.mockRejectedValue(new ApiError({ kind: 'problem', status: 404, code: 'NOT_FOUND' }));
    await renderScreen(<StoreScreen />);
    expect(await screen.findByText('Essa loja não está mais disponível.')).toBeOnTheScreen();
  });

  it('erro de servidor mostra tentar de novo', async () => {
    mockStore.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<StoreScreen />);
    expect(await screen.findByText('Não conseguimos carregar agora.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });
});

describe('Favoritar a loja (D8, WB-005)', () => {
  const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

  beforeEach(async () => {
    mockSetFavorite.mockReset();
    mockServerFavorites.clear();
    mockSetFavorite.mockImplementation(async (id: string, on: boolean) => {
      if (on) mockServerFavorites.add(id);
      else mockServerFavorites.delete(id);
    });
    await sessionStore.clear();
  });

  it('visitante vai para entrar com retorno exato e a ação fica pendente', async () => {
    await renderScreen(<StoreScreen />);
    await fireEvent.press(await screen.findByTestId('store.favorite'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { returnTo: '/store/s1' } });
    expect(takePendingFavorite('store', 's1')).toBe(true);
  });

  it('depois do login a ação pendente roda sozinha e o coração fica marcado', async () => {
    await renderScreen(<StoreScreen />);
    await fireEvent.press(await screen.findByTestId('store.favorite'));
    await login();
    await waitFor(() => expect(mockSetFavorite).toHaveBeenCalledWith('s1', true));
    expect(await screen.findByLabelText('Remover Casa Bela dos favoritos')).toBeOnTheScreen();
    expect(await screen.findByText('Loja salva nos favoritos.')).toBeOnTheScreen();
  });

  it('logado: favorita e desfavorita pela API', async () => {
    await login();
    await renderScreen(<StoreScreen />);
    await fireEvent.press(await screen.findByLabelText('Salvar Casa Bela nos favoritos'));
    await waitFor(() => expect(mockSetFavorite).toHaveBeenCalledWith('s1', true));
    await fireEvent.press(await screen.findByLabelText('Remover Casa Bela dos favoritos'));
    await waitFor(() => expect(mockSetFavorite).toHaveBeenLastCalledWith('s1', false));
  });
});

describe('Avaliações (D10)', () => {
  const r = (id: string) => ({ id, rating: 4, comment: `Comentário ${id}`, reviewer: 'Maria S.', verifiedPurchase: true, createdAt: '2026-11-12T12:00:00Z', storeReply: null, storeRepliedAt: null });

  beforeEach(() => expoRouter.useLocalSearchParams.mockReturnValue({ kind: 'store', id: 's1', name: 'Casa Bela' }));

  it('resumo com nota e total, lista com compra verificada e paginação', async () => {
    mockStoreReviews.mockResolvedValueOnce({ summary: rating(4.8, 120), data: [r('1'), r('2')], nextCursor: 'c2' });
    mockStoreReviews.mockResolvedValueOnce({ summary: rating(4.8, 120), data: [r('3')], nextCursor: null });
    await renderScreen(<ReviewsScreen />);
    expect(await screen.findByTestId('reviews.item-1')).toBeOnTheScreen();
    expect(screen.getByTestId('reviews.summary').props.accessibilityLabel).toBe('4,8 de 5, 120 avaliações');
    expect(screen.getAllByText('Compra verificada').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('reviews.load-more'));
    expect(await screen.findByTestId('reviews.item-3')).toBeOnTheScreen();
    expect(screen.queryByTestId('reviews.load-more')).toBeNull();
  });

  it('menos de 3 avaliações mostra "Novo" no lugar da média', async () => {
    mockStoreReviews.mockResolvedValue({ summary: { average: null, count: 2, isNew: true }, data: [r('1')], nextCursor: null });
    await renderScreen(<ReviewsScreen />);
    expect(await screen.findByText('Novo')).toBeOnTheScreen();
  });

  it('sem avaliações tem estado vazio com próximo passo', async () => {
    mockStoreReviews.mockResolvedValue({ summary: { average: null, count: 0, isNew: true }, data: [], nextCursor: null });
    await renderScreen(<ReviewsScreen />);
    expect(await screen.findByText('Ainda sem avaliações')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Voltar à loja' })).toBeOnTheScreen();
  });
});
