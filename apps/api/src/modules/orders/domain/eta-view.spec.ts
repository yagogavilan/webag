import { etaOfOrder, readyByAtOf } from './eta-view.js';

const paidAt = new Date('2026-11-19T18:00:00.000Z');
const delivery = (over: Partial<Parameters<typeof readyByAtOf>[0]> = {}) => ({ status: 'received', mode: 'delivery' as const, paidAt, deliverySnapshot: { eta: { prepMin: 20 } }, pickup: null, ...over });

describe('readyByAtOf (W.8, DEC-064c): pagamento aprovado + preparo da loja', () => {
  it('entrega: paidAt + o preparo gravado no pedido, em recebido, aceito e em preparo', () => {
    for (const status of ['received', 'accepted', 'in_preparation']) expect(readyByAtOf(delivery({ status }))).toBe('2026-11-19T18:20:00.000Z');
  });
  it('retirada: o fim da janela de preparo informada ao cliente [HIPÓTESE]', () => {
    expect(readyByAtOf(delivery({ mode: 'pickup', deliverySnapshot: null, pickup: { prepMaxMinutes: 45 } }))).toBe('2026-11-19T18:45:00.000Z');
  });
  it('nulo depois do "pronto", sem pagamento, ou em pedido sem o preparo gravado (anterior à DEC-053)', () => {
    expect(readyByAtOf(delivery({ status: 'ready_for_collection' }))).toBeNull();
    expect(readyByAtOf(delivery({ status: 'out_for_delivery' }))).toBeNull();
    expect(readyByAtOf(delivery({ paidAt: null }))).toBeNull();
    expect(readyByAtOf(delivery({ deliverySnapshot: null }))).toBeNull();
    expect(readyByAtOf(delivery({ deliverySnapshot: { eta: { prepMin: 'x' } } }))).toBeNull();
    expect(readyByAtOf(delivery({ mode: 'pickup', pickup: null }))).toBeNull();
  });
});

describe('etaOfOrder', () => {
  it('sem faixa em horário não há eta', () => {
    expect(etaOfOrder({ etaMinMinutes: 30, etaMaxMinutes: 60, etaFromAt: null, etaToAt: null })).toBeNull();
  });
});
