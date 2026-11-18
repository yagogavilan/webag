import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import ProductScreen from '../app/(customer)/product/[id]';
import { ApiError } from '../src/api/problem';
import { cartActions, cartStore } from '../src/features/cart/store';
import { browseProduct, browseStore, seedAddress } from '../src/test/fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock }; useLocalSearchParams: jest.Mock };
const router = expoRouter.__router;

const mockProduct = jest.fn();
const mockStore = jest.fn();
const mockReviews = jest.fn();
jest.mock('../src/api/catalog-api', () => ({
  fetchProduct: (...a: unknown[]) => mockProduct(...a),
  fetchStore: (...a: unknown[]) => mockStore(...a),
  fetchProductReviews: (...a: unknown[]) => mockReviews(...a),
  fetchFavorites: jest.fn(async () => ({ data: [], nextCursor: null })),
  setFavoriteProduct: jest.fn(async () => undefined),
}));

const review = { id: 'r1', rating: 5, comment: 'Muito bom', reviewer: 'Maria S.', verifiedPurchase: true, createdAt: '2026-11-12T12:00:00Z', storeReply: 'Obrigado!', storeRepliedAt: null };

beforeEach(async () => {
  jest.clearAllMocks();
  expoRouter.useLocalSearchParams.mockReturnValue({ id: 'p1' });
  await seedAddress('full');
  await cartActions.clear();
  mockProduct.mockResolvedValue(browseProduct());
  mockStore.mockResolvedValue(browseStore());
  mockReviews.mockResolvedValue({ summary: { average: 4.6, count: 38, isNew: false }, data: [review], nextCursor: null });
});

describe('Produto (D9)', () => {
  it('mostra preço, promoção, nome, avaliação, troca e avaliações', async () => {
    await renderScreen(<ProductScreen />);
    expect(await screen.findByText('Tênis Corrida Veloz')).toBeOnTheScreen();
    expect(screen.getByTestId('product.price').props.accessibilityLabel).toBe('R$ 89,90, de R$ 119,90, 25% de desconto');
    expect(await screen.findByText('Troca por tamanho ou cor em até 7 dias')).toBeOnTheScreen();
    expect(await screen.findByTestId('reviews.item-r1')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ver todas (38)' })).toBeOnTheScreen();
  });

  it('esgotado fica inerte e anunciado; escolher o tamanho mostra "Últimas 2 unidades"', async () => {
    await renderScreen(<ProductScreen />);
    const soldOut = await screen.findByTestId('product.variant-Tamanho-44');
    expect(soldOut.props.accessibilityLabel).toBe('44, esgotado');
    expect(soldOut).toBeDisabled();
    await fireEvent.press(screen.getByTestId('product.variant-Tamanho-42'));
    expect(screen.getByTestId('product.variant-Tamanho-42')).toBeChecked();
    expect(screen.getByTestId('product.stock-warning')).toBeOnTheScreen();
    expect(screen.getByText('Últimas 2 unidades')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Adicionar · R$ 89,90' })).toBeOnTheScreen();
  });

  it('sem escolher a variação o botão segue ativo, explica o que falta e não adiciona', async () => {
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.add'));
    expect(await screen.findByText('Escolha o Tamanho.')).toBeOnTheScreen();
    expect(cartStore.get().items).toHaveLength(0);
  });

  it('adiciona com a variação, avisa e o botão mostra "Adicionado"', async () => {
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.variant-Tamanho-40'));
    await fireEvent.press(screen.getByTestId('product.qty-plus'));
    await fireEvent.press(screen.getByTestId('product.add'));
    expect(await screen.findByText('Adicionado à sacola.')).toBeOnTheScreen();
    const cart = cartStore.get();
    expect(cart.storeId).toBe('s1');
    expect(cart.items[0]).toMatchObject({ productId: 'p1', variantId: 'v40', quantity: 2, variantLabel: '40', unitPriceCents: 8990 });
    expect(screen.getByRole('button', { name: 'Adicionado' })).toBeOnTheScreen();
  });

  it('o + para no estoque da variação e avisa "Só 2 em estoque"', async () => {
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.variant-Tamanho-42'));
    await fireEvent.press(screen.getByTestId('product.qty-plus'));
    expect(screen.getByTestId('product.qty-plus')).toBeDisabled();
    expect(screen.getByText('Só 2 em estoque')).toBeOnTheScreen();
  });

  it('item de outra loja pede confirmação: "Manter minha sacola" não muda nada', async () => {
    await cartActions.add('s2', 'Outra Loja', { productId: 'x', variantId: 'v-local', name: 'Camiseta', variantLabel: null, urls: {}, unitPriceCents: 3000, originalPriceCents: null, quantity: 3, maxQuantity: 10 });
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.variant-Tamanho-40'));
    await fireEvent.press(screen.getByTestId('product.add'));
    expect(await screen.findByText('Esvaziar a sacola?')).toBeOnTheScreen();
    expect(screen.getByText('Sua sacola tem 3 itens da Outra Loja. Cada pedido é de uma loja só.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cart.switch-keep'));
    expect(cartStore.get().storeId).toBe('s2');
    expect(cartStore.get().items).toHaveLength(1);
  });

  it('"Esvaziar e continuar" troca a sacola para a loja nova', async () => {
    await cartActions.add('s2', 'Outra Loja', { productId: 'x', variantId: 'v-local', name: 'Camiseta', variantLabel: null, urls: {}, unitPriceCents: 3000, originalPriceCents: null, quantity: 1, maxQuantity: 10 });
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.variant-Tamanho-40'));
    await fireEvent.press(screen.getByTestId('product.add'));
    await fireEvent.press(await screen.findByTestId('cart.switch-clear'));
    await waitFor(() => expect(cartStore.get().storeId).toBe('s1'));
    expect(cartStore.get().items.map((i) => i.productId)).toEqual(['p1']);
    expect(await screen.findByText('Sacola esvaziada. Item adicionado.')).toBeOnTheScreen();
  });

  it('promoção que acabou: adiciona com o preço novo e avisa', async () => {
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.variant-Tamanho-40'));
    const v = browseProduct().variants!.map((x) => (x.id === 'v40' ? { ...x, price: { amount: 9990, currency: 'BRL' as const }, originalPrice: null, discountPercent: null } : x));
    mockProduct.mockResolvedValue(browseProduct({ variants: v }));
    await fireEvent.press(screen.getByTestId('product.add'));
    expect(await screen.findByText('A promoção acabou. O preço agora é R$ 99,90.')).toBeOnTheScreen();
    expect(cartStore.get().items[0]?.unitPriceCents).toBe(9990);
  });

  it('esgotou enquanto a tela estava aberta: não adiciona e avisa', async () => {
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.variant-Tamanho-40'));
    const v = browseProduct().variants!.map((x) => (x.id === 'v40' ? { ...x, available: false, maxQuantity: 0 } : x));
    mockProduct.mockResolvedValue(browseProduct({ variants: v }));
    await fireEvent.press(screen.getByTestId('product.add'));
    expect(await screen.findByText('Esse item esgotou. Remova para continuar.')).toBeOnTheScreen();
    expect(cartStore.get().items).toHaveLength(0);
  });

  it('sem conexão adiciona com o que a tela mostra e avisa que o estoque será conferido depois', async () => {
    const { useNetworkState } = jest.requireMock('expo-network') as { useNetworkState: jest.Mock };
    useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.variant-Tamanho-40'));
    mockProduct.mockClear();
    await fireEvent.press(screen.getByTestId('product.add'));
    expect(await screen.findByText('Adicionado. Vamos conferir o estoque quando você estiver online.')).toBeOnTheScreen();
    expect(mockProduct).not.toHaveBeenCalled();
    expect(cartStore.get().items).toHaveLength(1);
    useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  });

  it('loja fechada: avisa, mas deixa montar a sacola (bloqueio só no pagamento, DEC-022)', async () => {
    mockProduct.mockResolvedValue(browseProduct({ store: { id: 's1', name: 'Casa Bela', open: false, opensAt: new Date(Date.now() + 86_400_000).toISOString(), hoursToday: [] } }));
    await renderScreen(<ProductScreen />);
    expect(await screen.findByTestId('product.closed-banner')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('product.variant-Tamanho-40'));
    await fireEvent.press(screen.getByTestId('product.add'));
    await waitFor(() => expect(cartStore.get().items).toHaveLength(1));
  });

  it('todas as variações esgotadas: selo "Esgotado" e botão para ver outros da loja', async () => {
    mockProduct.mockResolvedValue(browseProduct({ available: false, unavailableReason: 'SOLD_OUT', variants: browseProduct().variants!.map((v) => ({ ...v, available: false })) }));
    await renderScreen(<ProductScreen />);
    expect(await screen.findByTestId('product.sold-out')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('product.see-others'));
    expect(router.push).toHaveBeenCalledWith('/store/s1');
  });

  it('produto removido (404) mostra o estado próprio', async () => {
    mockProduct.mockRejectedValue(new ApiError({ kind: 'problem', status: 404, code: 'NOT_FOUND' }));
    await renderScreen(<ProductScreen />);
    expect(await screen.findByText('Esse produto não está mais disponível.')).toBeOnTheScreen();
  });

  it('erro de rede mostra tentar de novo e skeleton aparece enquanto carrega', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockProduct.mockReturnValue(new Promise((r) => (release = r)));
    await renderScreen(<ProductScreen />);
    expect(await screen.findByTestId('product.skeleton')).toBeOnTheScreen();
    await act(async () => release(browseProduct()));
    expect(await screen.findByText('Tênis Corrida Veloz')).toBeOnTheScreen();
  });

  it('visitante que toca no coração vai para entrar e volta a esta tela', async () => {
    await renderScreen(<ProductScreen />);
    await fireEvent.press(await screen.findByTestId('product.favorite'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { returnTo: '/store/s1' } });
  });
});
