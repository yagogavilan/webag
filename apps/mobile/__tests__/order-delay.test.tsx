import type { CancelRequest, Order } from '@webag/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import OrderScreen from '../app/(customer)/order/[id]';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { deliveryNotice } from '../src/features/orders/delivery-state';
import { formatHour } from '../src/features/orders/model';
import { orderFixture } from '../src/test/orders-fixtures';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };
const rn = jest.requireActual('react-native') as typeof import('react-native');

const mockOrder = jest.fn();
const mockLate = jest.fn();
const mockAsk = jest.fn();
jest.mock('../src/api/orders-api', () => ({
  fetchOrder: (...a: unknown[]) => mockOrder(...a),
  cancelOrderForDelay: (...a: unknown[]) => mockLate(...a),
  askOrderCancel: (...a: unknown[]) => mockAsk(...a),
  cancelMyOrder: jest.fn(),
}));
let mockSupport = '';
jest.mock('../src/features/checkout/config', () => {
  const actual = jest.requireActual('../src/features/checkout/config');
  return new Proxy(actual, { get: (target, key) => (key === 'SUPPORT_WHATSAPP' ? mockSupport : target[key]) });
});
jest.mock('../src/api/cart-api', () => ({ putCartItem: jest.fn(), fetchCart: jest.fn() }));

const ID = '11111111-1111-4111-8111-111111111111';
const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

const iso = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();
const eta = (fromMin: number, toMin: number) => ({ minMinutes: 0, maxMinutes: 0, fromAt: iso(fromMin), toAt: iso(toMin) });
const cancelRequest = (over: Partial<CancelRequest> = {}): CancelRequest => ({ id: 'c1', status: 'pending', reason: null, requestedAt: iso(-1), respondBy: iso(9), decidedAt: null, decidedBy: null, decisionNote: null, ...over });
const delivery = (e: ReturnType<typeof eta>) => ({ ...orderFixture().delivery!, eta: e });
const delay = (over: Record<string, unknown> = {}) => ({ late: true, canCancelWithoutCost: false, cancelAvailableAt: iso(10), cancelMode: null, cancelRequest: null, ...over });
const order = (over: Partial<Order>): Order => orderFixture(over);

beforeEach(async () => {
  jest.clearAllMocks();
  mockSupport = '';
  expoRouter.useLocalSearchParams.mockReturnValue({ id: ID });
  await sessionStore.clear();
  await login();
});

const everyText = () => JSON.stringify(screen.toJSON());

describe('Acompanhamento: faixa de entrega (DEC-053/054)', () => {
  it('mostra "Chega entre HH:MM e HH:MM" com a faixa do servidor, sem "2 h"', async () => {
    const e = eta(20, 50);
    mockOrder.mockResolvedValue(order({ status: 'accepted', delivery: delivery(e) }));
    await renderScreen(<OrderScreen />);
    const band = await screen.findByTestId('order.eta');
    expect(band.props.accessibilityLabel).toBe(`Chega entre ${formatHour(e.fromAt)} e ${formatHour(e.toAt)}`);
    expect(everyText()).not.toMatch(/\b2 ?h\b/i);
    expect(screen.queryByTestId('order.late-tag')).toBeNull();
  });
});

describe('Atraso (WB-253)', () => {
  it('atrasando: aviso com a hora em que nasce o direito de cancelar, sem botões de cancelar nem "2 h"', async () => {
    const cancelFrom = iso(12);
    mockOrder.mockResolvedValue(order({ status: 'in_preparation', delivery: delivery(eta(-40, -5)), delay: delay({ cancelAvailableAt: cancelFrom }) as never }));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByTestId('tracking.late-banner')).toBeOnTheScreen();
    expect(screen.getByTestId('order.late-tag')).toBeOnTheScreen();
    expect(screen.getByText('Passou do horário previsto')).toBeOnTheScreen();
    expect(screen.getByText('Previsto entre')).toBeOnTheScreen();
    expect(screen.getByText(`Já estamos cuidando disso. Se passar de ${formatHour(cancelFrom)}, você pode cancelar sem custo.`)).toBeOnTheScreen();
    expect(screen.getByTestId('order.late-passed', { includeHiddenElements: true })).toHaveTextContent('Passou 5 min. Já estamos cuidando disso.');
    expect(screen.queryByTestId('tracking.late-cancel')).toBeNull();
    expect(everyText()).not.toMatch(/\b2 ?h\b/i);
  });

  it('atrasado antes de sair: continuar esperando mantém o direito de cancelar (D5)', async () => {
    mockOrder.mockResolvedValue(order({ status: 'accepted', delivery: delivery(eta(-60, -25)), delay: delay({ canCancelWithoutCost: true, cancelMode: 'immediate' }) as never }));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByText('Passamos do prazo')).toBeOnTheScreen();
    expect(screen.getByText(/Você pode cancelar sem custo e receber R\$ 97,79 de volta, com a entrega, na mesma forma de pagamento/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('tracking.late-wait'));
    expect(screen.getByText('Combinado, seguimos')).toBeOnTheScreen();
    expect(screen.queryByTestId('tracking.late-wait')).toBeNull();
    expect(screen.getByTestId('tracking.late-cancel')).toBeOnTheScreen();
  });

  it('cancelar sem custo: folha de confirmação, uma chamada à API e reembolso na mesma forma de pagamento', async () => {
    mockOrder.mockResolvedValue(order({ status: 'accepted', delivery: delivery(eta(-60, -25)), delay: delay({ canCancelWithoutCost: true, cancelMode: 'immediate' }) as never }));
    mockLate.mockResolvedValue(order({ status: 'cancelled', allowedActions: [], cancellation: { by: 'customer', reason: 'Atraso na entrega', at: iso(0) } as never, payment: { method: 'pix', status: 'refunded' } }));
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('tracking.late-cancel'));
    expect(screen.getByText('Cancelar o pedido #1042?')).toBeOnTheScreen();
    expect(screen.getByText('Você recebe R$ 97,79 de volta, com a entrega, na mesma forma de pagamento. Os itens voltam para a loja.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('tracking.late-cancel-confirm'));
    await waitFor(() => expect(mockLate).toHaveBeenCalledTimes(1));
    expect(mockLate).toHaveBeenCalledWith(ID);
    // cancelado por atraso: devolução do valor inteiro à vista
    expect(await screen.findByTestId('tracking.refund')).toHaveTextContent(/R\$ 97,79/);
    expect(screen.getByTestId('tracking.late-cancelled')).toBeOnTheScreen();
    expect(screen.getByText('Cancelado sem custo')).toBeOnTheScreen();
  });

  it('cancelar sem custo antes do prazo: o servidor recusa e o app explica', async () => {
    mockOrder.mockResolvedValue(order({ status: 'accepted', delivery: delivery(eta(-60, -25)), delay: delay({ canCancelWithoutCost: true, cancelMode: 'immediate' }) as never }));
    mockLate.mockRejectedValue(new ApiError({ kind: 'problem', status: 409, code: 'LATE_CANCEL_NOT_AVAILABLE' }));
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('tracking.late-cancel'));
    await fireEvent.press(screen.getByTestId('tracking.late-cancel-confirm'));
    expect(await screen.findByText('Ainda não passou o prazo para cancelar sem custo.')).toBeOnTheScreen();
  });

  it('com o motoboy: "Pedir cancelamento" abre o pedido à operação e mostra até quando ela responde', async () => {
    const out = order({ status: 'out_for_delivery', delivery: delivery(eta(-60, -25)), delay: delay({ canCancelWithoutCost: true, cancelMode: 'request' }) as never });
    mockOrder.mockResolvedValueOnce(out);
    const respondBy = iso(10);
    mockLate.mockResolvedValue(order({ status: 'out_for_delivery', delivery: delivery(eta(-60, -25)), delay: delay({ canCancelWithoutCost: true, cancelMode: 'request', cancelRequest: cancelRequest({ respondBy }) }) as never }));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByText(/Seu pedido já está com o motoboy/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('tracking.late-request-cancel'));
    await waitFor(() => expect(mockLate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Pedido de cancelamento enviado', { exact: true })).toBeOnTheScreen();
    expect(screen.getByText(`A Webag responde até ${formatHour(respondBy)}. Sem resposta, cancelamos e devolvemos o valor inteiro, com a entrega.`)).toBeOnTheScreen();
  });

  it('retirada e pedido sem faixa gravada não têm estado de atraso', async () => {
    mockOrder.mockResolvedValue(order({ status: 'accepted', mode: 'pickup', delivery: null, delay: null as never }));
    await renderScreen(<OrderScreen />);
    await screen.findByTestId('order.status');
    expect(screen.queryByTestId('tracking.late-banner')).toBeNull();
    expect(screen.queryByTestId('order.late-tag')).toBeNull();
  });

  it('"Falar com a Webag" some quando não há WhatsApp configurado e abre o do ambiente quando há', async () => {
    mockOrder.mockResolvedValue(order({ status: 'in_preparation', delivery: delivery(eta(-40, -5)), delay: delay() as never }));
    await renderScreen(<OrderScreen />);
    await screen.findByTestId('tracking.late-banner');
    expect(screen.queryByTestId('tracking.late-contact')).toBeNull();
  });

  it('com WhatsApp da Webag configurado, abre a conversa com o número do pedido', async () => {
    mockSupport = '5511999990000';
    mockOrder.mockResolvedValue(order({ status: 'in_preparation', delivery: delivery(eta(-40, -5)), delay: delay() as never }));
    const spy = jest.spyOn(rn.Linking, 'openURL').mockResolvedValue(undefined);
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('tracking.late-contact'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(`https://wa.me/5511999990000?text=${encodeURIComponent('Olá! Meu pedido #1042 está atrasado.')}`));
  });
});

describe('Pedido de cancelamento durante o preparo (BUG-015)', () => {
  it('pede com motivo, a loja decide: o app envia e mostra "Aguardando a resposta da loja"', async () => {
    const respondBy = iso(9);
    mockOrder.mockResolvedValueOnce(order({ status: 'in_preparation', allowedActions: ['request_cancel', 'contact_store'] }));
    mockOrder.mockResolvedValue(order({ status: 'in_preparation', allowedActions: ['request_cancel', 'contact_store'], cancelRequest: cancelRequest({ respondBy }) }));
    mockAsk.mockResolvedValue(cancelRequest({ respondBy }));
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('order.request-cancel'));
    expect(screen.getByText('Pedir cancelamento?')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('order.request-cancel-reason'), 'Pedi o item errado');
    await fireEvent.press(screen.getByTestId('order.request-cancel-confirm'));
    await waitFor(() => expect(mockAsk).toHaveBeenCalledWith(ID, 'Pedi o item errado'));
    expect(await screen.findByTestId('order.cancel-request-pending')).toBeOnTheScreen();
    expect(screen.getByText(`A loja responde até ${formatHour(respondBy)}. Seu pedido continua em separação enquanto isso.`)).toBeOnTheScreen();
    // enquanto pendente, o botão some (pedir de novo não adianta)
    expect(screen.queryByTestId('order.request-cancel')).toBeNull();
  });

  it('sem motivo envia sem o campo; 409 mostra que não dá mais para cancelar por aqui', async () => {
    mockOrder.mockResolvedValue(order({ status: 'in_preparation', allowedActions: ['request_cancel', 'contact_store'] }));
    mockAsk.mockRejectedValue(new ApiError({ kind: 'problem', status: 409, code: 'ORDER_NOT_CANCELLABLE' }));
    await renderScreen(<OrderScreen />);
    await fireEvent.press(await screen.findByTestId('order.request-cancel'));
    await fireEvent.press(screen.getByTestId('order.request-cancel-confirm'));
    await waitFor(() => expect(mockAsk).toHaveBeenCalledWith(ID, undefined));
    expect(await screen.findByText('Este pedido não pode mais ser cancelado por aqui.')).toBeOnTheScreen();
  });

  it('passou do prazo da loja: a Webag decide', async () => {
    mockOrder.mockResolvedValue(order({ status: 'in_preparation', allowedActions: ['contact_store'], cancelRequest: cancelRequest({ respondBy: iso(-2) }) }));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByText('A Webag está avaliando')).toBeOnTheScreen();
  });

  it('recusado: o pedido segue em separação e mostra a resposta da loja', async () => {
    mockOrder.mockResolvedValue(order({ status: 'in_preparation', allowedActions: ['contact_store'], cancelRequest: cancelRequest({ status: 'refused', decidedBy: 'store', decidedAt: iso(0), decisionNote: 'Já está embalado' }) }));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByText('A loja não pôde cancelar')).toBeOnTheScreen();
    expect(screen.getByText('Seu pedido segue em separação. Resposta: Já está embalado')).toBeOnTheScreen();
  });

  it('aceito: pedido cancelado e o valor volta na mesma forma de pagamento', async () => {
    mockOrder.mockResolvedValue(order({ status: 'cancelled', allowedActions: [], cancellation: { by: 'store', reason: 'A pedido do cliente', at: iso(0) } as never, cancelRequest: cancelRequest({ status: 'approved', decidedBy: 'store', decidedAt: iso(0) }) }));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByTestId('order.cancel-request-approved')).toBeOnTheScreen();
    expect(screen.getByText('O valor volta para você, na mesma forma de pagamento.')).toBeOnTheScreen();
  });
});

describe('deliveryNotice (puro)', () => {
  const now = Date.now();
  it('precedência: cancelamento por atraso > pedido da operação > atraso', () => {
    expect(deliveryNotice(order({ status: 'accepted' }), now)).toBeNull();
    expect(deliveryNotice(order({ status: 'accepted', delivery: delivery(eta(-30, -5)), delay: delay() as never }), now)?.kind).toBe('late');
    expect(deliveryNotice(order({ status: 'accepted', delay: delay({ canCancelWithoutCost: true, cancelMode: 'immediate' }) as never }), now)?.kind).toBe('late-decide');
    expect(deliveryNotice(order({ status: 'out_for_delivery', delay: delay({ canCancelWithoutCost: true, cancelMode: 'request' }) as never }), now)?.kind).toBe('late-out');
    expect(deliveryNotice(order({ status: 'out_for_delivery', delay: delay({ cancelRequest: cancelRequest({ status: 'approved' }) }) as never }), now)?.kind).toBe('late-request-approved');
    expect(deliveryNotice(order({ status: 'cancelled', cancellation: { by: 'store', reason: 'Sem estoque', at: iso(0) } as never }), now)).toBeNull();
  });
});

describe('Compensação por atraso na tela do pedido (F2, WB-254)', () => {
  const compensation = (over: Record<string, unknown> = {}) => ({ kind: 'free_shipping', valueCents: null, code: 'ATRASOK7M2QXW9', validUntil: iso(60 * 24 * 30), status: 'available', ...over });

  it('pedido entregue com compensação mostra o bilhete e abre Meus cupons', async () => {
    mockOrder.mockResolvedValue(order({ status: 'delivered', compensation: compensation() } as Partial<Order>));
    await renderScreen(<OrderScreen />);
    expect(await screen.findByTestId('tracking.compensation')).toBeOnTheScreen();
    expect(screen.getByText('Entrega grátis no próximo pedido')).toBeOnTheScreen();
    expect(everyText()).not.toMatch(/\b2 ?h\b|30 dias/i);
    await fireEvent.press(screen.getByTestId('tracking.compensation-open'));
    const router = (jest.requireMock('expo-router') as { __router: { push: jest.Mock } }).__router;
    expect(router.push).toHaveBeenCalledWith('/coupons');
  });

  it('sem compensação (no prazo, dentro da tolerância, cancelado ou atrasado ainda a caminho) não promete nada', async () => {
    mockOrder.mockResolvedValue(order({ status: 'out_for_delivery', delivery: delivery(eta(-60, -30)), delay: delay() } as Partial<Order>));
    await renderScreen(<OrderScreen />);
    await screen.findByTestId('tracking.late-banner');
    expect(screen.queryByTestId('tracking.compensation')).toBeNull();
    expect(everyText()).not.toMatch(/entrega grátis/i);
  });
});
