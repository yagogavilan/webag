import { describe, expect, it } from 'vitest';
import { groupOf, nextStep, skipStep, refuseReasonText } from './status';
import type { StoreOrderAction } from '@/lib/api/orders';

const order = (status: Parameters<typeof nextStep>[0]['status'], mode: 'delivery' | 'pickup', allowedActions: StoreOrderAction[]) => ({ status, mode, allowedActions });

describe('próximo passo do pedido (DEC-036)', () => {
  it('entrega: a loja termina em "Pronto para coleta"; nunca oferece "saiu" nem "entregue"', () => {
    expect(nextStep(order('accepted', 'delivery', ['prepare', 'ready', 'cancel']))).toMatchObject({ label: 'Iniciar separação', to: 'in_preparation' });
    expect(nextStep(order('in_preparation', 'delivery', ['ready', 'cancel']))).toMatchObject({ label: 'Pronto para coleta', to: 'ready_for_collection' });
    expect(nextStep(order('ready_for_collection', 'delivery', []))).toBeNull();
    expect(nextStep(order('out_for_delivery', 'delivery', []))).toBeNull();
    expect(nextStep(order('delivered', 'delivery', []))).toBeNull();
  });
  it('retirada: pronto para retirar e depois entregar com código', () => {
    expect(nextStep(order('in_preparation', 'pickup', ['ready']))).toMatchObject({ label: 'Pronto para retirar', to: 'ready_for_pickup' });
    expect(nextStep(order('ready_for_pickup', 'pickup', ['complete']))).toMatchObject({ label: 'Entregar com código', action: 'complete' });
  });
  it('atalho de pular a separação só aparece com a ação permitida', () => {
    expect(skipStep(order('accepted', 'delivery', ['prepare']))).toBeNull();
    expect(skipStep(order('accepted', 'delivery', ['prepare', 'ready']))?.to).toBe('ready_for_collection');
  });
  it('agrupa os estados nas três colunas e esconde os que são da logística', () => {
    expect(groupOf('received')).toBe('new');
    expect(groupOf('in_preparation')).toBe('preparing');
    expect(groupOf('ready_for_collection')).toBe('ready');
    expect(groupOf('delivered')).toBeNull();
  });
  it('motivo "Outro" exige texto', () => {
    expect(refuseReasonText('other', ' ')).toBeNull();
    expect(refuseReasonText('other', 'Sem etiqueta')).toBe('Outro: Sem etiqueta');
    expect(refuseReasonText('out_of_stock', '')).toBe('Sem estoque');
  });
});
