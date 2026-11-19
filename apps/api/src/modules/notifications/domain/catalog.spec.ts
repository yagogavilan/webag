import { describe, expect, it } from 'vitest';
import type { ExchangeEvent } from '../../exchanges/exchange-events.bus.js';
import type { OrderEvent } from '../../orders/order-events.bus.js';
import { customerExchangeNotice, customerOrderNotice, storeExchangeNotice, storeOrderNotice } from './catalog.js';

const order = (over: Partial<OrderEvent>): OrderEvent => ({ orderId: 'o1', number: 'WB-ABCDE', userId: 'u1', storeId: 's1', from: 'awaiting_payment', to: 'received', actor: 'system', reason: null, at: new Date(), ...over });
const exchange = (over: Partial<ExchangeEvent>): ExchangeEvent => ({ exchangeId: 'x1', number: 'TR-ABCDE', orderId: 'o1', userId: 'u1', storeId: 's1', type: 'size_color', from: null, to: 'requested', actor: 'customer', reason: null, at: new Date(), ...over });

describe('catálogo de notificações', () => {
  it('pagamento aprovado: push e e-mail ao cliente e push de pedido novo à loja; sem dado pessoal nem código', () => {
    const notice = customerOrderNotice(order({}), 'Loja do Zé');
    expect(notice?.push?.body).toContain('WB-ABCDE');
    expect(notice?.email?.subject).toContain('WB-ABCDE');
    expect(storeOrderNotice(order({}))?.push?.title).toBe('Novo pedido');
    expect(storeOrderNotice(order({ from: 'received', to: 'accepted' }))).toBeNull();
    expect(JSON.stringify(customerOrderNotice(order({ to: 'ready_for_pickup' }), 'Loja'))).not.toMatch(/\d{4}\b(?!.*WB)/);
  });
  it('etapas só de acompanhamento não geram push (preparo, pronto para coleta, motoboy a caminho)', () => {
    expect(customerOrderNotice(order({ from: 'accepted', to: 'in_preparation' }), 'L')).toBeNull();
    expect(customerOrderNotice(order({ from: 'in_preparation', to: 'ready_for_collection' }), 'L')).toBeNull();
    expect(customerOrderNotice(order({ from: 'ready_for_collection', to: 'ready_for_collection', delivery: { id: 'd', status: 'courier_en_route' } }), 'L')).toBeNull();
    expect(customerOrderNotice(order({ from: 'ready_for_collection', to: 'out_for_delivery' }), 'L')?.push?.title).toBe('Saiu para entrega');
  });
  it('entrega não realizada e cancelamento levam e-mail com o motivo', () => {
    expect(customerOrderNotice(order({ to: 'ready_for_collection', from: 'out_for_delivery', delivery: { id: 'd', status: 'not_delivered' }, reason: 'cliente ausente' }), 'L')?.email?.text).toContain('cliente ausente');
    const cancelled = customerOrderNotice(order({ from: 'received', to: 'refused', reason: 'sem estoque' }), 'L');
    expect(cancelled?.push?.body).toContain('sem estoque');
    expect(cancelled?.email).toBeDefined();
  });
  it('troca: confirmação imediata com protocolo por e-mail e push; a loja é avisada do pedido e da aprovação automática', () => {
    const requested = customerExchangeNotice(exchange({ type: 'withdrawal' }));
    expect(requested?.email?.subject).toContain('TR-ABCDE');
    expect(requested?.push?.body).toContain('desistência');
    expect(storeExchangeNotice(exchange({}))?.push?.body).toContain('24 horas');
    expect(storeExchangeNotice(exchange({ from: 'requested', to: 'awaiting_fee', actor: 'system' }))).toBeNull();
    expect(storeExchangeNotice(exchange({ from: 'requested', to: 'approved', actor: 'system', reason: 'Aprovada automaticamente' }))?.push?.title).toContain('sistema');
    expect(customerExchangeNotice(exchange({ from: 'requested', to: 'rejected', reason: 'Item usado' }))?.push?.body).toContain('Item usado');
  });
  it('WB-241 C7: coleta atrasada avisa o cliente com o novo prazo (data de São Paulo) e texto neutro', () => {
    const notice = customerExchangeNotice(exchange({ from: 'approved', to: 'approved', actor: 'system', notice: 'collection_late', newDeadlineAt: new Date('2026-12-03T02:30:00Z') }));
    expect(notice?.push?.title).toBe('A coleta da sua troca atrasou');
    expect(notice?.push?.body).toContain('TR-ABCDE');
    expect(notice?.push?.body).toContain('até 02/12'); // 23:30 do dia 02 em São Paulo
    expect(notice?.push?.body).not.toMatch(/culpa|erro nosso/i);
  });
});
