import { compensationCoupon, deservesCompensation, lateStateOf } from './late.js';

const end = new Date('2026-11-19T16:00:00Z');
const at = (min: number) => new Date(end.getTime() + min * 60_000);
const order = { mode: 'delivery' as const, status: 'in_preparation' as const, etaToAt: end };

describe('atraso da entrega (RN-19 item 4)', () => {
  it('dentro da faixa não é atraso; passou do fim é atraso; só depois da tolerância libera o cancelamento', () => {
    expect(lateStateOf(order, 15, at(0))).toMatchObject({ late: false, canCancelWithoutCost: false });
    expect(lateStateOf(order, 15, at(1))).toMatchObject({ late: true, canCancelWithoutCost: false, cancelMode: null });
    expect(lateStateOf(order, 15, at(14))).toMatchObject({ canCancelWithoutCost: false });
    expect(lateStateOf(order, 15, at(15))).toMatchObject({ late: true, canCancelWithoutCost: true, cancelMode: 'immediate' });
  });
  it('em saída para entrega o cancelamento vira pedido à operação', () => {
    expect(lateStateOf({ ...order, status: 'out_for_delivery' }, 15, at(20)).cancelMode).toBe('request');
  });
  it('retirada, pedido sem faixa e estados finais ficam de fora', () => {
    expect(lateStateOf({ ...order, mode: 'pickup' }, 15, at(60)).late).toBe(false);
    expect(lateStateOf({ ...order, etaToAt: null }, 15, at(60)).late).toBe(false);
    expect(lateStateOf({ ...order, status: 'delivered' }, 15, at(60)).late).toBe(false);
    expect(lateStateOf({ ...order, status: 'awaiting_payment' }, 15, at(60)).late).toBe(false);
  });
  it('compensação só depois do fim da faixa + tolerância (no limite exato não compensa)', () => {
    expect(deservesCompensation(order, at(15), 15)).toBe(false);
    expect(deservesCompensation(order, at(16), 15)).toBe(true);
    expect(deservesCompensation({ ...order, mode: 'pickup' }, at(60), 15)).toBe(false);
  });
  it('tipo da compensação: frete grátis (padrão), valor ou nenhuma', () => {
    expect(compensationCoupon('frete_gratis_proximo', 1000)).toEqual({ kind: 'free_shipping', value: 0 });
    expect(compensationCoupon('cupom_valor', 1000)).toEqual({ kind: 'fixed', value: 1000 });
    expect(compensationCoupon('cupom_valor', 0)).toBeNull();
    expect(compensationCoupon('nenhuma', 1000)).toBeNull();
  });
});
