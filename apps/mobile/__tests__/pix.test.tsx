import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import PixScreen from '../app/(customer)/pay/[orderId]';
import { sessionStore } from '../src/api/session';
import { orderFixture, paymentFixture } from '../src/test/orders-fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock }; useLocalSearchParams: jest.Mock };
const router = expoRouter.__router;

const mockOrder = jest.fn();
const mockPayment = jest.fn();
jest.mock('../src/api/orders-api', () => ({
  fetchOrder: (...a: unknown[]) => mockOrder(...a),
  fetchOrderPayment: (...a: unknown[]) => mockPayment(...a),
}));
const mockPut = jest.fn();
jest.mock('../src/api/cart-api', () => ({ putCartItem: (...a: unknown[]) => mockPut(...a), fetchCart: jest.fn() }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

beforeEach(async () => {
  jest.clearAllMocks();
  expoRouter.useLocalSearchParams.mockReturnValue({ orderId: '11111111-1111-4111-8111-111111111111' });
  await sessionStore.clear();
  await login();
});

describe('S5. Pagamento com PIX', () => {
  it('mostra o valor, a contagem e copia o código sem marcar nada como pago', async () => {
    mockOrder.mockResolvedValue(orderFixture({ status: 'awaiting_payment', payment: { method: 'pix', status: 'pending' } }));
    mockPayment.mockResolvedValue(paymentFixture());
    await renderScreen(<PixScreen />);
    expect(await screen.findByTestId('pix.amount')).toHaveTextContent('R$ 97,79');
    expect(screen.getByTestId('pix.countdown')).toBeOnTheScreen();
    expect(screen.getByTestId('pix.code')).toHaveTextContent('00020126TESTE-PIX-COPIA-E-COLA');
    await fireEvent.press(screen.getByTestId('pix.copy'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('00020126TESTE-PIX-COPIA-E-COLA'));
    expect(await screen.findByText('Código copiado')).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('skeleton enquanto o código é gerado', async () => {
    mockOrder.mockReturnValue(new Promise(() => undefined));
    mockPayment.mockReturnValue(new Promise(() => undefined));
    await renderScreen(<PixScreen />);
    expect(await screen.findByTestId('pix.skeleton')).toBeOnTheScreen();
    expect(screen.getByText('Gerando seu código…')).toBeOnTheScreen();
  });

  it('só segue para "Pedido confirmado" quando o SERVIDOR diz que o pedido foi pago', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockOrder.mockResolvedValue(orderFixture({ status: 'received' }));
    mockPayment.mockResolvedValue(paymentFixture({ status: 'approved' }));
    await renderScreen(<PixScreen />);
    expect(await screen.findByTestId('pix.paid')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/confirmed/[orderId]', params: { orderId: '11111111-1111-4111-8111-111111111111' } });
    jest.useRealTimers();
  });

  it('código vencido: oferece gerar outro e devolve os itens à sacola', async () => {
    mockOrder.mockResolvedValue(orderFixture({ status: 'expired', payment: { method: 'pix', status: 'expired' } }));
    mockPayment.mockResolvedValue(paymentFixture({ status: 'expired' }));
    mockPut.mockResolvedValue({});
    await renderScreen(<PixScreen />);
    expect(await screen.findByText('O código venceu.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Gerar novo código' }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('v1', 1, expect.anything(), true));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/checkout'));
  });

  it('sem estoque ao gerar de novo: avisa e leva à sacola', async () => {
    mockOrder.mockResolvedValue(orderFixture({ status: 'expired' }));
    mockPayment.mockResolvedValue(paymentFixture({ status: 'expired' }));
    mockPut.mockRejectedValue(new Error('OUT_OF_STOCK'));
    await renderScreen(<PixScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Gerar novo código' }));
    expect(await screen.findByText('Acabou o estoque de Camiseta Básica. Volte à sacola.')).toBeOnTheScreen();
  });

  it('falha ao carregar: erro com ação de tentar de novo', async () => {
    mockOrder.mockRejectedValue(new Error('boom'));
    mockPayment.mockRejectedValue(new Error('boom'));
    await renderScreen(<PixScreen />);
    expect(await screen.findByTestId('pix.error', {}, { timeout: 4000 })).toBeOnTheScreen();
  });
});
