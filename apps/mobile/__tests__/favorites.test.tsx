import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import FavoritesScreen from '../app/(customer)/favorites';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock } };
const router = expoRouter.__router;

const mockList = jest.fn();
const mockSetStore = jest.fn();
const mockSetProduct = jest.fn();
jest.mock('../src/api/catalog-api', () => ({
  fetchFavorites: (...a: unknown[]) => mockList(...a),
  setFavoriteStore: (...a: unknown[]) => mockSetStore(...a),
  setFavoriteProduct: (...a: unknown[]) => mockSetProduct(...a),
}));

const storeFav = (id: string, over = {}) => ({ kind: 'store', unavailable: false, favoritedAt: '2026-11-10T10:00:00Z', store: { id, name: `Loja ${id}`, logo: { urls: {} } }, product: null, ...over });
const productFav = (id: string, over = {}) => ({ kind: 'product', unavailable: false, favoritedAt: '2026-11-10T10:00:00Z', store: null, product: { id, name: `Produto ${id}`, image: { urls: {} }, price: { amount: 5000, currency: 'BRL' }, storeId: 's1', storeName: 'Casa Bela' }, ...over });

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

beforeEach(async () => {
  jest.clearAllMocks();
  mockList.mockReset();
  mockSetStore.mockReset();
  mockSetStore.mockResolvedValue(undefined);
  mockSetProduct.mockResolvedValue(undefined);
  await sessionStore.clear();
});

describe('Favoritos (D11)', () => {
  it('visitante: convida a entrar e volta para esta tela', async () => {
    await renderScreen(<FavoritesScreen />);
    expect(screen.getByText('Entre para salvar favoritos')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { returnTo: '/favorites' } });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('lista lojas, mostra "Indisponível" e abre a loja', async () => {
    await login();
    mockList.mockResolvedValue({ data: [storeFav('s1'), storeFav('s2', { unavailable: true })], nextCursor: null });
    await renderScreen(<FavoritesScreen />);
    expect(await screen.findByTestId('favorites.item-s1')).toBeOnTheScreen();
    expect(screen.getByTestId('favorites.item-s2').props.accessibilityLabel).toBe('Loja s2, Indisponível');
    await fireEvent.press(screen.getByTestId('favorites.item-s1'));
    expect(router.push).toHaveBeenCalledWith('/store/s1');
  });

  it('skeleton enquanto carrega e vazio com próximo passo', async () => {
    await login();
    let release: (v: unknown) => void = () => undefined;
    mockList.mockReturnValue(new Promise((r) => (release = r)));
    await renderScreen(<FavoritesScreen />);
    expect(await screen.findByTestId('favorites.skeleton')).toBeOnTheScreen();
    await act(async () => release({ data: [], nextCursor: null }));
    expect(await screen.findByText('Nenhum favorito ainda')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Explorar lojas' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('remover some na hora, chama a API e o toast oferece "Desfazer"', async () => {
    await login();
    mockList.mockResolvedValue({ data: [storeFav('s1')], nextCursor: null });
    await renderScreen(<FavoritesScreen />);
    await fireEvent.press(await screen.findByLabelText('Remover Loja s1 dos favoritos'));
    await waitFor(() => expect(mockSetStore).toHaveBeenCalledWith('s1', false));
    expect(screen.queryByTestId('favorites.item-s1')).toBeNull();
    expect(await screen.findByText('Removido dos favoritos.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(mockSetStore).toHaveBeenLastCalledWith('s1', true));
    expect(await screen.findByTestId('favorites.item-s1')).toBeOnTheScreen();
  });

  it('remover com falha: o item volta e avisa', async () => {
    await login();
    mockList.mockResolvedValue({ data: [storeFav('s1')], nextCursor: null });
    mockSetStore.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<FavoritesScreen />);
    await fireEvent.press(await screen.findByLabelText('Remover Loja s1 dos favoritos'));
    expect(await screen.findByText('Não foi possível remover. Tentar de novo.')).toBeOnTheScreen();
    expect(await screen.findByTestId('favorites.item-s1')).toBeOnTheScreen();
  });

  it('aba Produtos usa grade, mostra preço e a loja e remove por produto', async () => {
    await login();
    mockList.mockImplementation(async (p: { kind: string }) => (p.kind === 'product' ? { data: [productFav('p1')], nextCursor: null } : { data: [], nextCursor: null }));
    await renderScreen(<FavoritesScreen />);
    await screen.findByText('Nenhum favorito ainda');
    await fireEvent.press(screen.getByTestId('favorites.tab-products'));
    const item = await screen.findByTestId('favorites.item-p1');
    expect(item.props.accessibilityLabel).toContain('R$ 50,00');
    expect(item.props.accessibilityLabel).toContain('na loja Casa Bela');
    await fireEvent.press(screen.getByLabelText('Remover Produto p1 dos favoritos'));
    await waitFor(() => expect(mockSetProduct).toHaveBeenCalledWith('p1', false));
  });

  it('erro da lista mostra tentar de novo', async () => {
    await login();
    mockList.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<FavoritesScreen />);
    expect(await screen.findByText('Não conseguimos carregar agora.')).toBeOnTheScreen();
  });
});
