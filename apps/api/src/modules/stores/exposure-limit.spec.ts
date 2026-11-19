import { evaluateExposureLimit, type ExposureInput } from './exposure-limit.js';

const now = new Date('2026-12-01T12:00:00Z');
const base: ExposureInput = { mode: 'default', customMaxCents: null, since: new Date('2026-11-20T12:00:00Z'), deliveredOrders: 3, now, params: { days: 30, orders: 20, maxOrderCents: 50_000 } };

describe('limite de exposição da loja nova (WB-225)', () => {
  it('loja recém-aprovada com poucos pedidos: R$ 500 ativo', () => {
    expect(evaluateExposureLimit(base)).toMatchObject({ active: true, maxOrderCents: 50_000, ordersToEnd: 17 });
  });
  it('acaba pelo prazo (30 dias) ou pelos 20 pedidos entregues, o que vier primeiro', () => {
    expect(evaluateExposureLimit({ ...base, now: new Date('2026-12-20T12:00:00Z') }).active).toBe(false); // exatamente 30 dias
    expect(evaluateExposureLimit({ ...base, now: new Date('2026-12-20T11:59:59Z') }).active).toBe(true);
    expect(evaluateExposureLimit({ ...base, deliveredOrders: 19 }).active).toBe(true);
    expect(evaluateExposureLimit({ ...base, deliveredOrders: 20 })).toMatchObject({ active: false, maxOrderCents: null });
  });
  it('liberada pelo admin: sem limite; personalizada: troca só o teto e respeita o fim', () => {
    expect(evaluateExposureLimit({ ...base, mode: 'released' })).toMatchObject({ active: false, maxOrderCents: null, endsAt: null });
    expect(evaluateExposureLimit({ ...base, mode: 'custom', customMaxCents: 120_000 })).toMatchObject({ active: true, maxOrderCents: 120_000 });
    expect(evaluateExposureLimit({ ...base, mode: 'custom', customMaxCents: 120_000, deliveredOrders: 25 }).active).toBe(false);
  });
});
