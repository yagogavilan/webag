import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import CheckoutScreen from '../app/(customer)/checkout';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { cartActions } from '../src/features/cart/store';
import { modeStore } from '../src/features/catalog/queries';
import { orderFixture } from '../src/test/orders-fixtures';
import { serverCart, seedAddress } from '../src/test/fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock } };
const router = expoRouter.__router;

const mockFetch = jest.fn();
jest.mock('../src/api/cart-api', () => ({ fetchCart: (...a: unknown[]) => mockFetch(...a), acceptCartChanges: jest.fn(), putCartItem: jest.fn(), mergeGuestCart: jest.fn() }));
const mockPlace = jest.fn();
jest.mock('../src/api/orders-api', () => ({ placeOrder: (...a: unknown[]) => mockPlace(...a) }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

beforeEach(async () => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockPlace.mockReset();
  mockFetch.mockResolvedValue(serverCart());
  await sessionStore.clear();
  await seedAddress('full', true);
  await cartActions.clear();
  await modeStore.set('delivery');
});

describe('S3. Checkout', () => {
  it('visitante: cadastro/login só aqui, voltando ao checkout', async () => {
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Entrar' }));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/signup', params: { returnTo: '/checkout', context: 'checkout' } });
  });

  it('PIX: manda a revisão, o total esperado e a chave de idempotência, e abre a tela do PIX', async () => {
    await login();
    mockPlace.mockResolvedValue(orderFixture({ status: 'awaiting_payment' }));
    await renderScreen(<CheckoutScreen />);
    const pay = await screen.findByTestId('checkout.submit');
    expect(screen.getByTestId('checkout.summary')).toBeOnTheScreen();
    await fireEvent.press(pay);
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0]?.[0]).toMatchObject({ mode: 'delivery', cartRevision: 3, expectedTotalCents: 18680, paymentMethod: 'pix' });
    expect(String(mockPlace.mock.calls[0]?.[1]).length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(mockPlace.mock.calls[0]?.[0])).not.toMatch(/\"(number|cvv|expiry)\"/);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/pay/[orderId]', params: { orderId: orderFixture().id } }));
  });

  it('toque duplo cria um pedido só', async () => {
    await login();
    let release: (v: unknown) => void = () => undefined;
    mockPlace.mockReturnValue(new Promise((r) => (release = r)));
    await renderScreen(<CheckoutScreen />);
    const pay = await screen.findByTestId('checkout.submit');
    await fireEvent.press(pay);
    await fireEvent.press(pay);
    expect(mockPlace).toHaveBeenCalledTimes(1);
    release(orderFixture());
  });

  it('cartão de teste: manda só o token do provedor, nunca dados de cartão', async () => {
    await login();
    mockPlace.mockResolvedValue(orderFixture({ payment: { method: 'card', status: 'approved' } }));
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-card'));
    await fireEvent.press(screen.getByTestId('card.test-fake_tok_approved'));
    await fireEvent.press(screen.getByTestId('card.installment-2'));
    await fireEvent.press(screen.getByTestId('checkout.submit'));
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0]?.[0]).toMatchObject({ paymentMethod: 'card', card: { token: 'fake_tok_approved', installments: 2 } });
  });

  it('cartão sem escolher: diz o que falta ao tocar, sem chamar a API', async () => {
    await login();
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-card'));
    await fireEvent.press(screen.getByTestId('checkout.submit'));
    expect(await screen.findByText('Confira os dados do cartão.')).toBeOnTheScreen();
    expect(mockPlace).not.toHaveBeenCalled();
  });

  it('cartão recusado: oferece trocar o cartão ou pagar com PIX', async () => {
    await login();
    mockPlace.mockRejectedValue(new ApiError({ kind: 'problem', status: 422, code: 'PAYMENT_DECLINED', detail: 'Saldo insuficiente.' }));
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-card'));
    await fireEvent.press(screen.getByTestId('card.test-fake_tok_insufficient'));
    await fireEvent.press(screen.getByTestId('checkout.submit'));
    expect(await screen.findByTestId('card.error-sheet')).toHaveTextContent(/O banco não aprovou esse cartão/);
    await fireEvent.press(screen.getByTestId('card.pay-with-pix'));
    expect(screen.queryByTestId('card.error-sheet')).toBeNull();
  });

  it('sem conexão ao pagar: avisa e não envia', async () => {
    await login();
    (jest.requireMock('expo-network') as { useNetworkState: jest.Mock }).useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.submit'));
    expect(mockPlace).not.toHaveBeenCalled();
    (jest.requireMock('expo-network') as { useNetworkState: jest.Mock }).useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  });

  it('erro ao conferir a sacola: tentar de novo', async () => {
    await login();
    mockFetch.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<CheckoutScreen />);
    expect(await screen.findByTestId('checkout.error', {}, { timeout: 5000 })).toBeOnTheScreen();
  });
});
