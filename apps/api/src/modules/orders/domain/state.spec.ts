import { canTransition, customerActions, isTerminal, nextStatuses, ORDER_STATUSES, refundDueOnCancel, type OrderActor, type OrderMode } from './state.js';

const ACTORS: OrderActor[] = ['customer', 'store', 'system', 'admin'];
const MODES: OrderMode[] = ['delivery', 'pickup'];

describe('máquina de estados do pedido (RN-07)', () => {
  it('caminho feliz de entrega e de retirada', () => {
    const delivery: [string, string, OrderActor][] = [['awaiting_payment', 'received', 'system'], ['received', 'accepted', 'store'], ['accepted', 'in_preparation', 'store'], ['in_preparation', 'out_for_delivery', 'store'], ['out_for_delivery', 'delivered', 'store']];
    for (const [from, to, actor] of delivery) expect(canTransition(from as never, to as never, actor, 'delivery'), `${from}->${to}`).toBe(true);
    expect(canTransition('accepted', 'ready_for_pickup', 'store', 'pickup')).toBe(true);
    expect(canTransition('ready_for_pickup', 'delivered', 'store', 'pickup')).toBe(true);
  });

  it('retirada não sai para entrega e entrega não fica pronta para retirada', () => {
    expect(canTransition('accepted', 'out_for_delivery', 'store', 'pickup')).toBe(false);
    expect(canTransition('accepted', 'ready_for_pickup', 'store', 'delivery')).toBe(false);
  });

  it('só o sistema marca como pago; o cliente nunca avança o pedido (SEC-035)', () => {
    for (const actor of ACTORS.filter((a) => a !== 'system')) expect(canTransition('awaiting_payment', 'received', actor, 'delivery')).toBe(false);
    for (const to of ORDER_STATUSES) if (to !== 'cancelled') expect(canTransition('received', to, 'customer', 'delivery')).toBe(false);
  });

  it('estados terminais não têm saída e não há retrocesso', () => {
    for (const from of ORDER_STATUSES.filter(isTerminal)) for (const to of ORDER_STATUSES) for (const actor of ACTORS) for (const mode of MODES) expect(canTransition(from, to, actor, mode)).toBe(false);
    expect(canTransition('accepted', 'received', 'admin', 'delivery')).toBe(false);
    expect(canTransition('delivered', 'out_for_delivery', 'admin', 'delivery')).toBe(false);
  });

  it('cliente cancela até o aceite; depois da separação só por solicitação (RN-08)', () => {
    for (const from of ['awaiting_payment', 'received', 'accepted'] as const) expect(canTransition(from, 'cancelled', 'customer', 'delivery')).toBe(true);
    for (const from of ['in_preparation', 'out_for_delivery', 'ready_for_pickup'] as const) expect(canTransition(from, 'cancelled', 'customer', 'delivery')).toBe(false);
  });

  it('recusa é da loja e só enquanto recebido; o timeout de aceite cancela como sistema', () => {
    expect(canTransition('received', 'refused', 'store', 'delivery')).toBe(true);
    expect(canTransition('accepted', 'refused', 'store', 'delivery')).toBe(false);
    expect(canTransition('received', 'cancelled', 'system', 'delivery')).toBe(true);
  });

  it('nenhuma transição é permitida sem ator: todo estado não terminal tem saída para algum ator', () => {
    for (const from of ORDER_STATUSES.filter((s) => !isTerminal(s))) expect(ACTORS.flatMap((a) => nextStatuses(from, a, 'delivery')).length).toBeGreaterThan(0);
  });

  it('ações do cliente e devolução de dinheiro', () => {
    expect(customerActions('received')).toContain('cancel');
    expect(customerActions('in_preparation')).toEqual(['request_cancel', 'contact_store']);
    expect(customerActions('cancelled')).toEqual([]);
    expect(refundDueOnCancel('awaiting_payment')).toBe(false);
    expect(refundDueOnCancel('received')).toBe(true);
    expect(refundDueOnCancel('accepted')).toBe(true);
    expect(refundDueOnCancel('delivered')).toBe(false);
  });
});
