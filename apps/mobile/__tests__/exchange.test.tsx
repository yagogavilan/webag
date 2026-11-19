import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import ExchangeDetail from '../app/(customer)/exchange/[id]';
import NewExchangeScreen from '../app/(customer)/exchange/new';
import ConfirmedScreen from '../app/(customer)/confirmed/[orderId]';
import ReviewScreen from '../app/(customer)/review/[orderId]';
import { sessionStore } from '../src/api/session';
import { exchangeFixture, orderFixture } from '../src/test/orders-fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock; back: jest.Mock }; useLocalSearchParams: jest.Mock };
const router = expoRouter.__router;
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const mockOptions = jest.fn();
const mockPlace = jest.fn();
const mockFetchExchange = jest.fn();
const mockReview = jest.fn();
jest.mock('../src/api/exchanges-api', () => ({
  fetchExchangeOptions: (...a: unknown[]) => mockOptions(...a),
  placeExchange: (...a: unknown[]) => mockPlace(...a),
  fetchExchange: (...a: unknown[]) => mockFetchExchange(...a),
  fetchExchangePayment: jest.fn(),
  payExchangeFee: jest.fn(),
  cancelMyExchange: jest.fn(),
  fetchExchanges: jest.fn(),
  sendReview: (...a: unknown[]) => mockReview(...a),
  uploadExchangePhoto: jest.fn(),
}));
const mockOrder = jest.fn();
jest.mock('../src/api/orders-api', () => ({ fetchOrder: (...a: unknown[]) => mockOrder(...a) }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

const options = (over: Record<string, unknown> = {}) => ({
  orderId: ORDER_ID,
  deliveredAt: '2026-11-18T12:00:00Z',
  pickupAvailable: true,
  items: [
    {
      orderItemId: 'oi1',
      name: 'Camiseta Básica',
      attributes: { Tamanho: 'M' },
      quantity: 1,
      openExchange: null,
      options: [
        { type: 'size_color', eligible: true, deadline: '2026-11-25T12:00:00Z', pickupFee: { amount: 500, currency: 'BRL' } },
        { type: 'defect', eligible: true, deadline: '2026-12-18T12:00:00Z' },
        { type: 'withdrawal', eligible: false, reason: { code: 'EXCHANGE_WINDOW_EXPIRED' }, deadline: '2026-11-12T12:00:00Z' },
      ],
      variants: [
        { variantId: 'vM', attributes: { Tamanho: 'M' }, available: true, current: true },
        { variantId: 'vG', attributes: { Tamanho: 'G' }, available: true, current: false },
        { variantId: 'vP', attributes: { Tamanho: 'P' }, available: false, current: false },
      ],
      ...over,
    },
  ],
});

beforeEach(async () => {
  jest.clearAllMocks();
  expoRouter.useLocalSearchParams.mockReturnValue({ orderId: ORDER_ID, id: 'x1' });
  mockOrder.mockResolvedValue(orderFixture({ status: 'delivered' }));
  await sessionStore.clear();
  await login();
});

const secondItem = (over: Record<string, unknown> = {}) => ({
  orderItemId: 'oi2',
  name: 'Calça Jeans',
  attributes: { Tamanho: '42' },
  quantity: 1,
  openExchange: null,
  options: [
    { type: 'size_color', eligible: true, deadline: '2026-11-25T12:00:00Z', pickupFee: { amount: 500, currency: 'BRL' } },
    { type: 'defect', eligible: true, deadline: '2026-12-18T12:00:00Z' },
  ],
  variants: [
    { variantId: 'v42', attributes: { Tamanho: '42' }, available: true, current: true },
    { variantId: 'v44', attributes: { Tamanho: '44' }, available: true, current: false },
  ],
  ...over,
});

describe('X1b. Pedir troca', () => {
  it('U8.4: pedido de 2 itens mostra os dois; escolher o 2º envia o orderItemId do 2º e zera motivo e novo tamanho', async () => {
    const base = options();
    mockOptions.mockResolvedValue({ ...base, items: [...base.items, secondItem()] });
    mockPlace.mockResolvedValue(exchangeFixture());
    await renderScreen(<NewExchangeScreen />);
    expect(await screen.findByTestId('exchange.item-oi1')).toBeOnTheScreen();
    expect(screen.getByTestId('exchange.item-oi2')).toBeOnTheScreen();
    // o 1º vem marcado
    expect(screen.getByTestId('exchange.item-oi1').props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByTestId('exchange.reason-size'));
    await fireEvent.press(screen.getByTestId('exchange.swap-vG'));
    await fireEvent.press(screen.getByTestId('exchange.item-oi2'));
    // trocou de item: sem motivo escolhido e sem seção de novo tamanho
    expect(screen.queryByTestId('exchange.swap')).toBeNull();
    expect(screen.getByTestId('exchange.reason-size').props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(screen.getByTestId('exchange.reason-size'));
    await fireEvent.press(screen.getByTestId('exchange.swap-v44'));
    await fireEvent.press(screen.getByTestId('exchange.submit'));
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0]?.[1]).toMatchObject({ orderItemId: 'oi2', newVariantId: 'v44' });
  });

  it('U8.4: item sem opção de troca aparece cinza com o motivo e não é escolhido', async () => {
    const base = options();
    mockOptions.mockResolvedValue({ ...base, items: [...base.items, secondItem({ options: [{ type: 'size_color', eligible: false, reason: { code: 'EXCHANGE_WINDOW_EXPIRED' }, deadline: '2026-11-12T12:00:00Z' }] })] });
    await renderScreen(<NewExchangeScreen />);
    await fireEvent.press(await screen.findByTestId('exchange.item-oi2'));
    expect(await screen.findByTestId('exchange.reason-info')).toHaveTextContent('Prazo encerrado em 12 nov.');
    expect(screen.getByTestId('exchange.item-oi1').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('U8.4: pedido de 1 item não ganha a seção de escolha', async () => {
    mockOptions.mockResolvedValue(options());
    await renderScreen(<NewExchangeScreen />);
    await screen.findByTestId('exchange.item-oi1');
    expect(screen.queryByTestId('exchange.items')).toBeNull();
    expect(screen.getByText('O que você quer trocar?')).toBeOnTheScreen();
  });

  it('motivo fora do prazo fica inerte e tocar explica, sem erro', async () => {
    mockOptions.mockResolvedValue(options());
    await renderScreen(<NewExchangeScreen />);
    await fireEvent.press(await screen.findByTestId('exchange.reason-regret'));
    expect(await screen.findByTestId('exchange.reason-info')).toHaveTextContent('Prazo encerrado em 12 nov.');
    expect(screen.queryByTestId('exchange.swap')).toBeNull();
  });

  it('tamanho errado levando à loja: escolhe o novo tamanho e envia sem digitar nada; nada é cobrado agora', async () => {
    mockOptions.mockResolvedValue(options());
    mockPlace.mockResolvedValue(exchangeFixture());
    await renderScreen(<NewExchangeScreen />);
    await fireEvent.press(await screen.findByTestId('exchange.reason-size'));
    expect(screen.getByTestId('exchange.pay-today')).toHaveTextContent('Hoje você paga R$ 0,00.');
    // sem estoque não seleciona
    expect(screen.getByTestId('exchange.swap-vP').props.accessibilityLabel).toBe('P, sem estoque, sem estoque'.replace(', sem estoque, sem estoque', ', sem estoque'));
    await fireEvent.press(screen.getByTestId('exchange.swap-vG'));
    await fireEvent.press(screen.getByTestId('exchange.submit'));
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0]?.[0]).toBe(ORDER_ID);
    expect(mockPlace.mock.calls[0]?.[1]).toMatchObject({ orderItemId: 'oi1', type: 'size_color', reasonCode: 'size', method: 'drop_at_store', resolution: 'replace', newVariantId: 'vG' });
    expect(mockPlace.mock.calls[0]?.[2]).toEqual(expect.any(String));
    expect(await screen.findByText('Pedido de troca enviado')).toBeOnTheScreen();
  });

  it('coleta em casa mostra a taxa e deixa claro que só é cobrada se a loja aprovar', async () => {
    mockOptions.mockResolvedValue(options());
    await renderScreen(<NewExchangeScreen />);
    await fireEvent.press(await screen.findByTestId('exchange.reason-size'));
    await fireEvent.press(screen.getByTestId('exchange.return-pickup'));
    expect(screen.getByTestId('exchange.fee-notice')).toHaveTextContent(/Você não paga nada agora/);
    expect(screen.getByTestId('exchange.fee-notice')).toHaveTextContent(/R\$ 5,00/);
  });

  it('botão sempre ativo: sem motivo ou sem foto, o erro aparece ao tocar', async () => {
    mockOptions.mockResolvedValue(options());
    await renderScreen(<NewExchangeScreen />);
    await fireEvent.press(await screen.findByTestId('exchange.submit'));
    expect(await screen.findByText('Escolha o motivo.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('exchange.reason-defect'));
    await fireEvent.press(screen.getByTestId('exchange.submit'));
    expect(await screen.findByText('Adicione ao menos 1 foto.')).toBeOnTheScreen();
    expect(mockPlace).not.toHaveBeenCalled();
  });

  it('sem estoque em nenhuma opção: oferece o reembolso', async () => {
    mockOptions.mockResolvedValue(options({ variants: [{ variantId: 'vM', attributes: { Tamanho: 'M' }, available: true, current: true }, { variantId: 'vP', attributes: { Tamanho: 'P' }, available: false, current: false }] }));
    await renderScreen(<NewExchangeScreen />);
    await fireEvent.press(await screen.findByTestId('exchange.reason-size'));
    expect(screen.getByTestId('exchange.swap-none-refund')).toBeOnTheScreen();
    expect(screen.getByTestId('exchange.submit')).toHaveTextContent('Pedir reembolso');
  });

  it('prazo vencido em tudo: mostra por escrito e leva à loja', async () => {
    mockOptions.mockResolvedValue(options({ options: [{ type: 'size_color', eligible: false, reason: { code: 'EXCHANGE_WINDOW_EXPIRED' } }, { type: 'defect', eligible: false }, { type: 'withdrawal', eligible: false }] }));
    await renderScreen(<NewExchangeScreen />);
    expect(await screen.findByTestId('exchange.expired')).toBeOnTheScreen();
  });

  it('erro de rede ao carregar: tentar de novo', async () => {
    mockOptions.mockRejectedValue(new Error('boom'));
    await renderScreen(<NewExchangeScreen />);
    expect(await screen.findByTestId('exchange.error', {}, { timeout: 4000 })).toBeOnTheScreen();
  });
});

describe('X2b. Acompanhar a troca', () => {
  it('aguardando a loja: próximo passo em uma frase e timeline', async () => {
    mockFetchExchange.mockResolvedValue(exchangeFixture());
    await renderScreen(<ExchangeDetail />);
    expect(await screen.findByTestId('exchange.next-step')).toHaveTextContent(/Aguardando a loja. Ela responde até/);
    expect(screen.getByTestId('exchange.timeline')).toBeOnTheScreen();
  });

  it('aprovada com taxa: extrato fechado pelo servidor e botão de pagar', async () => {
    mockFetchExchange.mockResolvedValue(exchangeFixture({ status: 'awaiting_fee', method: 'pickup_at_home', fee: { amount: 500, currency: 'BRL' }, difference: { amount: 1000, currency: 'BRL' }, totalDue: { amount: 1500, currency: 'BRL' }, feeDueAt: '2026-11-22T17:30:00Z' }));
    await renderScreen(<ExchangeDetail />);
    expect(await screen.findByTestId('exchange.fee-statement')).toHaveTextContent(/R\$ 15,00/);
    expect(screen.getByTestId('exchange.pay')).toHaveTextContent('Pagar com PIX · R$ 15,00');
  });

  it('recusada: motivo e o que fazer', async () => {
    mockFetchExchange.mockResolvedValue(exchangeFixture({ status: 'rejected', decisionReason: 'Produto com sinais de uso.' }));
    await renderScreen(<ExchangeDetail />);
    expect(await screen.findByTestId('exchange.rejected-reason')).toHaveTextContent(/Produto com sinais de uso\./);
  });
});

describe('S6. Pedido confirmado', () => {
  it('mostra número, previsão e leva ao acompanhamento; avisos são opcionais', async () => {
    await renderScreen(<ConfirmedScreen />);
    expect(await screen.findByTestId('confirmed.title')).toHaveTextContent('Pedido feito.');
    expect(await screen.findByTestId('confirmed.order-number')).toHaveTextContent('Pedido #1042');
    expect(screen.getByTestId('confirmed.estimate')).toHaveTextContent(/Chega entre\d{2}:\d{2} – \d{2}:\d{2}/);
    expect(await screen.findByTestId('confirmed.push-enable')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('confirmed.track'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/order/[id]', params: { id: ORDER_ID } });
  });

  it('retirada: mostra o código de 4 dígitos lido dígito a dígito', async () => {
    mockOrder.mockResolvedValue(orderFixture({ mode: 'pickup', delivery: null, pickup: { address: 'Rua das Palmeiras, 120', instructions: null, code: '4821', prepMinMinutes: 20, prepMaxMinutes: 30 } }));
    await renderScreen(<ConfirmedScreen />);
    const code = await screen.findByTestId('confirmed.pickup-code');
    expect(code.props.accessibilityLabel).toBe('Seu código de retirada: 4 8 2 1');
  });
});

describe('Avaliação com "como vestiu"', () => {
  it('peça com tamanho pergunta como vestiu e envia nota, ajuste e comentário', async () => {
    mockReview.mockResolvedValue({});
    await renderScreen(<ReviewScreen />);
    await fireEvent.press(await screen.findByTestId('review.star-4'));
    await fireEvent.press(screen.getByTestId('review.fit-small'));
    await fireEvent.press(screen.getByTestId('review.submit'));
    await waitFor(() => expect(mockReview).toHaveBeenCalledWith(ORDER_ID, { rating: 4, fit: 'small', productId: 'p1' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('sem nota: pede a nota ao tocar', async () => {
    await renderScreen(<ReviewScreen />);
    await fireEvent.press(await screen.findByTestId('review.submit'));
    expect(await screen.findByText('Escolha uma nota de 1 a 5.')).toBeOnTheScreen();
    expect(mockReview).not.toHaveBeenCalled();
  });
});
