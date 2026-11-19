import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import OrderScreen from '../app/(customer)/order/[id]';
import OrdersScreen from '../app/(customer)/(tabs)/orders';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { orderFixture, summaryFixture } from '../src/test/orders-fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock }; useLocalSearchParams: jest.Mock };
const router = expoRouter.__router;
const rn = jest.requireActual('react-native') as typeof import('react-native');

const mockList = jest.fn();
const mockOrder = jest.fn();
const mockCancel = jest.fn();
jest.mock('../src/api/orders-api', () => ({
  fetchOrders: (...a: unknown[]) => mockList(...a),
  fetchOrder: (...a: unknown[]) => mockOrder(...a),
  cancelMyOrder: (...a: unknown[]) => mockCancel(...a),
}));
jest.mock('../src/api/cart-api', () => ({ putCartItem: jest.fn(), fetchCart: jest.fn() }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

beforeEach(async () => {
  jest.clearAllMocks();
  mockList.mockReset();
  expoRouter.useLocalSearchParams.mockReturnValue({ id: '11111111-1111-4111-8111-111111111111' });
  await sessionStore.clear();
});

describe('S8. Meus pedidos', () => {
  it('visitante: convida a entrar, sem chamar a API', async () => {
    await renderScreen(<OrdersScreen />);
    expect(await screen.findByText('Entre para ver seus pedidos')).toBeOnTheScreen();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('separa em andamento e anteriores; PIX pendente tem "Pagar" e entregue tem "Pedir de novo"', async () => {
    await login();
    mockList.mockImplementation((scope: string) =>
      Promise.resolve(
        scope === 'active'
          ? { data: [summaryFixture({ id: 'a1', status: 'awaiting_payment' })], nextCursor: null }
          : { data: [summaryFixture({ id: 'p1', status: 'delivered' })], nextCursor: null },
      ),
    );
    await renderScreen(<OrdersScreen />);
    expect(await screen.findByTestId('orders.section-active')).toBeOnTheScreen();
    expect(screen.getByTestId('orders.section-past')).toBeOnTheScreen();
    expect(screen.getByTestId('orders.item-a1').props.accessibilityLabel).toMatch(/^Casa Bela, Aguardando pagamento, 18 nov, \d{2}:\d{2}, 3 itens$/);
    await fireEvent.press(screen.getByTestId('orders.pay-pix-a1'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/pay/[orderId]', params: { orderId: 'a1' } });
    expect(screen.getByTestId('orders.reorder-p1')).toBeOnTheScreen();
  });

  it('vazio com próximo passo e erro com tentar de novo', async () => {
    await login();
    mockList.mockResolvedValue({ data: [], nextCursor: null });
    await renderScreen(<OrdersScreen />);
    expect(await screen.findByText('Você ainda não fez pedidos')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver lojas' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('erro de rede: ação de tentar de novo', async () => {
    await login();
    mockList.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<OrdersScreen />);
    expect(await screen.findByTestId('orders.error', {}, { timeout: 4000 })).toBeOnTheScreen();
  });
});

describe('S7. Pedido: acompanhar', () => {
  it('mostra a linha do tempo com 6 passos e fala com a loja pelo WhatsApp', async () => {
    await login();
    mockOrder.mockResolvedValue(orderFixture({ status: 'accepted' }));
    const open = jest.spyOn(rn.Linking, 'openURL').mockResolvedValue(undefined);
    await renderScreen(<OrderScreen />);
    expect(await screen.findByTestId('order.timeline')).toBeOnTheScreen();
    expect(screen.getByTestId('order.step-6')).toBeOnTheScreen();
    expect(screen.getByTestId('order.step-1').props.accessibilityLabel).toMatch(/^Passo 1 de 6, Pedido recebido, concluído às/);
    await fireEvent.press(screen.getByTestId('order.whatsapp'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://wa.me/5511987654321?text=Ol%C3%A1%2C%20sobre%20o%20pedido%20%231042'));
  });

  it('cancela até a separação: confirma, chama a API uma vez e avisa o estorno', async () => {
    await login();
    mockOrder.mockResolvedValue(orderFixture({ status: 'accepted' }));
    mockCancel.mockResolvedValue(orderFixture({ status: 'cancelled', allowedActions: [], payment: { method: 'pix', status: 'refunded' } }));
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('order.cancel'));
    expect(screen.getByText('Cancelar o pedido?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('order.cancel-confirm'));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Pedido cancelado. O valor volta para você.')).toBeOnTheScreen();
  });

  it('depois da separação não há botão de cancelar, só pedir à loja', async () => {
    await login();
    mockOrder.mockResolvedValue(orderFixture({ status: 'in_preparation', allowedActions: ['request_cancel', 'contact_store'] }));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByTestId('order.request-cancel')).toBeOnTheScreen();
    expect(screen.queryByTestId('order.cancel')).toBeNull();
  });

  it('entregue: avaliar e pedir troca estão ao alcance', async () => {
    await login();
    mockOrder.mockResolvedValue(orderFixture({ status: 'delivered', allowedActions: ['rate', 'request_exchange', 'contact_store'] }));
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('order.exchange'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/exchange/new', params: { orderId: '11111111-1111-4111-8111-111111111111' } });
    await fireEvent.press(screen.getByTestId('order.review'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/review/[orderId]', params: { orderId: '11111111-1111-4111-8111-111111111111' } });
  });

  it('pedido de outra conta (404): "Não encontramos esse pedido"', async () => {
    await login();
    mockOrder.mockRejectedValue(new ApiError({ kind: 'problem', status: 404, code: 'NOT_FOUND' }));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByTestId('order.not-found')).toBeOnTheScreen();
  });
});
