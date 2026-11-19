import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
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
const mockIntent = jest.fn();
jest.mock('../src/api/orders-api', () => ({ placeOrder: (...a: unknown[]) => mockPlace(...a), startCardIntent: (...a: unknown[]) => mockIntent(...a), fetchOrders: jest.fn() }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

beforeEach(async () => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockPlace.mockReset();
  mockIntent.mockReset();
  mockFetch.mockResolvedValue(serverCart());
  await sessionStore.clear();
  await seedAddress('full', true);
  await cartActions.clear();
  await modeStore.set('delivery');
});

const at = (h: number, m: number) => new Date(2026, 10, 19, h, m).toISOString();

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
    await fireEvent.press(await screen.findByTestId('checkout.pay-pix'));
    const pay = await screen.findByTestId('checkout.submit');
    expect(screen.getByTestId('checkout.summary')).toBeOnTheScreen();
    await fireEvent.press(pay);
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0]?.[0]).toMatchObject({ mode: 'delivery', cartRevision: 3, expectedTotalCents: 18680, paymentMethod: 'pix' });
    expect(String(mockPlace.mock.calls[0]?.[1]).length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(mockPlace.mock.calls[0]?.[0])).not.toMatch(/\"(number|cvv|expiry)\"/);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/pay/[orderId]', params: { orderId: orderFixture().id } }));
  });

  it('409 ETA_CHANGED (WB-261): envia o fim da faixa visto; nenhum pedido, folha "O horário mudou" com antes e agora; continuar relê a sacola e reenvia com o fim aceito', async () => {
    await login();
    mockFetch.mockResolvedValue(serverCart({ delivery: { mode: 'delivery', addressId: null, available: true, distanceM: 1200, feeFromCents: 500, estimated: false, eta: { fromAt: at(18, 45), toAt: at(19, 20) } } }));
    mockPlace.mockRejectedValueOnce(new ApiError({ kind: 'problem', status: 409, code: 'ETA_CHANGED', body: { eta: { fromAt: at(19, 0), toAt: at(19, 35) } } }));
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-pix'));
    await fireEvent.press(await screen.findByTestId('checkout.submit'));

    expect(await screen.findByTestId('cart.eta-changed-sheet')).toBeOnTheScreen();
    expect(mockPlace.mock.calls[0]?.[0]).toMatchObject({ mode: 'delivery', acceptedEtaToAt: at(19, 20) });
    expect(screen.getByText('O horário mudou')).toBeOnTheScreen();
    expect(screen.getByText('18:45 – 19:20')).toBeOnTheScreen();
    expect(screen.getByTestId('cart.eta-changed-new')).toHaveTextContent('19:00 – 19:35');
    expect(router.replace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/pay/[orderId]' }));

    const reads = mockFetch.mock.calls.length;
    await fireEvent.press(screen.getByTestId('cart.eta-changed-accept'));
    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.queryByTestId('cart.eta-changed-new')).toBeNull());

    // o cliente toca em Pagar de novo: chave de idempotência nova (a anterior ficou presa à resposta 409)
    mockPlace.mockResolvedValueOnce(orderFixture({ status: 'awaiting_payment' }));
    await fireEvent.press(screen.getByTestId('checkout.submit'));
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(2));
    expect(mockPlace.mock.calls[1]?.[1]).not.toBe(mockPlace.mock.calls[0]?.[1]);
    // reenviado com o fim da faixa NOVA (o do 409), que o cliente aceitou na folha
    expect(mockPlace.mock.calls[1]?.[0]).toMatchObject({ acceptedEtaToAt: at(19, 35) });
  });

  it('sacola sem faixa do servidor não manda `acceptedEtaToAt` (nada a conferir)', async () => {
    await login();
    mockPlace.mockResolvedValue(orderFixture({ status: 'awaiting_payment' }));
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-pix'));
    await fireEvent.press(await screen.findByTestId('checkout.submit'));
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0]?.[0]).not.toHaveProperty('acceptedEtaToAt');
  });

  it('409 ETA_CHANGED: "Voltar à sacola" leva à sacola', async () => {
    await login();
    mockPlace.mockRejectedValueOnce(new ApiError({ kind: 'problem', status: 409, code: 'ETA_CHANGED', body: {} }));
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-pix'));
    await fireEvent.press(await screen.findByTestId('checkout.submit'));
    await fireEvent.press(await screen.findByTestId('cart.eta-changed-back'));
    expect(router.replace).toHaveBeenCalledWith('/cart');
  });

  it('toque duplo cria um pedido só', async () => {
    await login();
    let release: (v: unknown) => void = () => undefined;
    mockPlace.mockReturnValue(new Promise((r) => (release = r)));
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-pix'));
    const pay = await screen.findByTestId('checkout.submit');
    await fireEvent.press(pay);
    await fireEvent.press(pay);
    expect(mockPlace).toHaveBeenCalledTimes(1);
    release(orderFixture());
  });

  it('nenhum meio vem escolhido (sem destaque ao PIX): tocar em pagar pede a escolha e não chama a API', async () => {
    await login();
    await renderScreen(<CheckoutScreen />);
    const pay = await screen.findByTestId('checkout.submit');
    expect(screen.getByText('Escolha como pagar')).toBeOnTheScreen();
    await fireEvent.press(pay);
    expect(await screen.findByTestId('checkout.method-error')).toBeOnTheScreen();
    expect(mockPlace).not.toHaveBeenCalled();
    expect(mockIntent).not.toHaveBeenCalled();
  });

  it('cartão: pede a intenção com o total visto e abre SÓ a página segura do Webag; nunca cria pedido nem lê cartão', async () => {
    await login();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    mockIntent.mockResolvedValue({ token: 'tok', url: 'http://localhost:3001/pagar/cartao?i=0123456789abcdef0123', expiresAt: new Date(Date.now() + 900_000).toISOString(), amount: { amount: 18680, currency: 'BRL' } });
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-card'));
    expect(screen.getByTestId('checkout.card-secure-note')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('checkout.submit'));
    await waitFor(() => expect(mockIntent).toHaveBeenCalledTimes(1));
    expect(mockIntent.mock.calls[0]?.[0]).toMatchObject({ mode: 'delivery', cartRevision: 3, expectedTotalCents: 18680 });
    expect(JSON.stringify(mockIntent.mock.calls[0]?.[0])).not.toMatch(/token|card|cvv|number/i);
    await waitFor(() => expect(open).toHaveBeenCalledWith('http://localhost:3001/pagar/cartao?i=0123456789abcdef0123'));
    expect(router.push).toHaveBeenCalledWith('/card-wait');
    expect(mockPlace).not.toHaveBeenCalled();
  });

  it('cartão: URL de outro endereço vinda da API nunca é aberta', async () => {
    await login();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    open.mockClear();
    mockIntent.mockResolvedValue({ token: 'tok', url: 'https://evil.example/pagar/cartao?i=0123456789abcdef0123', expiresAt: new Date(Date.now() + 900_000).toISOString(), amount: { amount: 18680, currency: 'BRL' } });
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-card'));
    await fireEvent.press(screen.getByTestId('checkout.submit'));
    await waitFor(() => expect(mockIntent).toHaveBeenCalled());
    expect(open).not.toHaveBeenCalled();
  });

  it('sem conexão ao pagar: avisa e não envia', async () => {
    await login();
    (jest.requireMock('expo-network') as { useNetworkState: jest.Mock }).useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await renderScreen(<CheckoutScreen />);
    await fireEvent.press(await screen.findByTestId('checkout.pay-pix'));
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
