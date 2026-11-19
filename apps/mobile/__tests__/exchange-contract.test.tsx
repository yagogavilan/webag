import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import ExchangeDetail from '../app/(customer)/exchange/[id]';
import OrderScreen from '../app/(customer)/order/[id]';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { exchangeFixture, orderFixture } from '../src/test/orders-fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const mockFetchExchange = jest.fn();
const mockSwitch = jest.fn();
const mockContest = jest.fn();
jest.mock('../src/api/exchanges-api', () => ({
  fetchExchange: (...a: unknown[]) => mockFetchExchange(...a),
  switchMyExchangeToStore: (...a: unknown[]) => mockSwitch(...a),
  contestRefusal: (...a: unknown[]) => mockContest(...a),
  fetchExchangePayment: jest.fn(),
  payExchangeFee: jest.fn(),
  cancelMyExchange: jest.fn(),
  fetchExchanges: jest.fn(),
  fetchExchangeOptions: jest.fn(),
  placeExchange: jest.fn(),
  sendReview: jest.fn(),
  uploadExchangePhoto: jest.fn(),
}));
const mockOrder = jest.fn();
const mockNotReceived = jest.fn();
jest.mock('../src/api/orders-api', () => ({ fetchOrder: (...a: unknown[]) => mockOrder(...a), reportNotReceived: (...a: unknown[]) => mockNotReceived(...a), cancelMyOrder: jest.fn(), fetchOrders: jest.fn() }));
jest.mock('../src/api/cart-api', () => ({ putCartItem: jest.fn(), fetchCart: jest.fn() }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

beforeEach(async () => {
  jest.clearAllMocks();
  await login();
  expoRouter.useLocalSearchParams.mockReturnValue({ id: ORDER_ID });
  mockOrder.mockResolvedValue(orderFixture());
});

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe('Troca com o contrato novo', () => {
  it('mostra a diferença de preço e o prazo "até DD/MM"', async () => {
    mockFetchExchange.mockResolvedValue(exchangeFixture({ status: 'approved', method: 'pickup_at_home', difference: { amount: 1000, currency: 'BRL' }, itemDueAt: '2026-11-25T12:00:00Z' }));
    await renderScreen(<ExchangeDetail />);
    expect(await screen.findByTestId('exchange.item-due')).toHaveTextContent('Leve o item até 25/11');
    expect(screen.getByText(/Diferença de preço: R\$ 10,00/)).toBeOnTheScreen();
  });

  it('"Levar à loja" troca a coleta pelo código do balcão; taxa já paga explica', async () => {
    mockFetchExchange.mockResolvedValue(exchangeFixture({ status: 'approved', method: 'pickup_at_home', feePaid: false }));
    mockSwitch.mockResolvedValue(exchangeFixture({ status: 'approved', method: 'drop_at_store', storeCode: 'K7Q2' }));
    await renderScreen(<ExchangeDetail />);
    await fireEvent.press(await screen.findByTestId('exchange.drop-at-store'));
    await fireEvent.press(await screen.findByTestId('exchange.drop-confirm'));
    await waitFor(() => expect(mockSwitch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('K7Q2')).toBeOnTheScreen();
  });

  it('taxa de coleta já paga: o botão "Levar à loja" não aparece', async () => {
    mockFetchExchange.mockResolvedValue(exchangeFixture({ status: 'approved', method: 'pickup_at_home', feePaid: true }));
    await renderScreen(<ExchangeDetail />);
    await screen.findByTestId('exchange.timeline');
    expect(screen.queryByTestId('exchange.drop-at-store')).toBeNull();
  });

  it('contestar a recusa da loja: exige 10 caracteres e manda o texto', async () => {
    mockFetchExchange.mockResolvedValue(exchangeFixture({ status: 'rejected', decisionReason: 'Sinais de uso.', contestableUntil: inDays(5), contested: false }));
    mockContest.mockResolvedValue(exchangeFixture({ status: 'in_mediation' }));
    await renderScreen(<ExchangeDetail />);
    await fireEvent.press(await screen.findByTestId('exchange.contest'));
    await fireEvent.changeText(await screen.findByTestId('exchange.contest-input'), 'curto');
    await fireEvent.press(screen.getByTestId('exchange.contest-submit'));
    expect(await screen.findByText('Escreva ao menos 10 caracteres.')).toBeOnTheScreen();
    expect(mockContest).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('exchange.contest-input'), 'O produto veio com defeito de fábrica.');
    await fireEvent.press(screen.getByTestId('exchange.contest-submit'));
    await waitFor(() => expect(mockContest).toHaveBeenCalledWith(expect.anything(), 'O produto veio com defeito de fábrica.'));
  });

  it('recusa fora do prazo de contestação: não oferece contestar', async () => {
    mockFetchExchange.mockResolvedValue(exchangeFixture({ status: 'rejected', contestableUntil: inDays(-1), contested: false }));
    await renderScreen(<ExchangeDetail />);
    await screen.findByTestId('exchange.rejected-card');
    expect(screen.queryByTestId('exchange.contest')).toBeNull();
  });
});

describe('Não recebi meu pedido', () => {
  it('aparece quando o servidor permite e avisa a operação com confirmação', async () => {
    mockOrder.mockResolvedValue(orderFixture({ status: 'out_for_delivery', allowedActions: ['contact_store', 'report_not_received'] } as never));
    mockNotReceived.mockResolvedValue({ reported: true });
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('order.not-received'));
    await fireEvent.press(await screen.findByTestId('order.not-received-confirm'));
    await waitFor(() => expect(mockNotReceived).toHaveBeenCalledWith(ORDER_ID));
  });

  it('fora da janela: avisa e não some em silêncio', async () => {
    mockOrder.mockResolvedValue(orderFixture({ status: 'delivered', allowedActions: ['report_not_received'] } as never));
    mockNotReceived.mockRejectedValue(new ApiError({ kind: 'problem', status: 409, code: 'ORDER_NOT_REPORTABLE' }));
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('order.not-received'));
    await fireEvent.press(await screen.findByTestId('order.not-received-confirm'));
    expect(await screen.findByText('O prazo para avisar acabou. Fale com o Webag pela Ajuda.')).toBeOnTheScreen();
  });

  it('sem permissão do servidor, o botão não existe', async () => {
    mockOrder.mockResolvedValue(orderFixture({ allowedActions: ['cancel'] }));
    await renderScreen(<OrderScreen />);
    await screen.findByTestId('order.cancel');
    expect(screen.queryByTestId('order.not-received')).toBeNull();
  });
});
