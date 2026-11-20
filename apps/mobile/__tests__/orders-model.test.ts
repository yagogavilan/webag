import { buildExchangeRequest, exchangeSteps, firstMissing, formatDay, nextStepText, reasonState, type ExchangeDraft } from '../src/features/exchanges/model';
import { failureNode, presentStatus, timelineSteps, whatsappUrl } from '../src/features/orders/model';
import { orderFixture } from '../src/test/orders-fixtures';

describe('linha do tempo do pedido', () => {
  it('entrega tem 6 passos, com "Aguardando motoboy" antes de "Saiu para entrega"', () => {
    const steps = timelineSteps(orderFixture({ status: 'ready_for_collection' }));
    expect(steps.map((s) => s.label)).toEqual(['Pedido recebido', 'Pedido aceito', 'Em separação', 'Aguardando motoboy', 'Saiu para entrega', 'Entregue']);
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming']);
  });

  it('retirada tem 5 passos e termina em "Pronto para retirada"', () => {
    const steps = timelineSteps(orderFixture({ mode: 'pickup', status: 'in_preparation' }));
    expect(steps).toHaveLength(5);
    expect(steps[3]?.label).toBe('Pronto para retirada');
    expect(steps[2]?.state).toBe('current');
  });

  it('pedido aguardando pagamento não mostra passos concluídos', () => {
    const steps = timelineSteps(orderFixture({ status: 'awaiting_payment', timeline: [] }));
    expect(steps.every((s) => s.state === 'upcoming')).toBe(true);
  });

  it('cancelado mostra motivo e quem cancelou', () => {
    const o = orderFixture({ status: 'cancelled', cancellation: { by: 'customer', reason: 'Mudei de ideia', at: '2026-11-18T18:00:00Z' } });
    expect(failureNode(o)).toMatchObject({ label: 'Cancelado', by: 'Você', reason: 'Mudei de ideia' });
    expect(presentStatus('ready_for_collection').label).toBe('Aguardando motoboy');
  });

  it('WhatsApp: acrescenta 55 e recusa número inválido', () => {
    expect(whatsappUrl('11987654321', 'Olá')).toBe('https://wa.me/5511987654321?text=Ol%C3%A1');
    expect(whatsappUrl('123', 'x')).toBeNull();
  });
});

describe('pedido de troca', () => {
  const item = {
    orderItemId: 'oi1',
    options: [
      { type: 'size_color', eligible: true, deadline: '2026-11-25T12:00:00Z', pickupFee: { amount: 500, currency: 'BRL' } },
      { type: 'defect', eligible: true, deadline: '2026-12-18T12:00:00Z' },
      { type: 'withdrawal', eligible: false, reason: { code: 'EXCHANGE_WINDOW_EXPIRED' }, deadline: '2026-11-12T12:00:00Z' },
    ],
  } as never;

  it('motivo bloqueado explica por escrito, com a data', () => {
    expect(reasonState(item, 'regret')).toMatchObject({ eligible: false, blocked: 'Prazo encerrado em 12 nov.' });
    expect(reasonState(item, 'size')).toMatchObject({ eligible: true, pickupFeeCents: 500 });
    expect(formatDay('2026-11-25T12:00:00Z')).toBe('25 nov');
  });

  const base: ExchangeDraft = { orderItemId: 'oi1', reason: 'size', newVariantId: 'v2', prefer: 'replace', method: 'drop_at_store', photoIds: [], note: '' };

  it('tamanho com peça nova pede reposição; sem peça nova vira reembolso', () => {
    expect(buildExchangeRequest(base)).toMatchObject({ type: 'size_color', reasonCode: 'size', resolution: 'replace', newVariantId: 'v2', method: 'drop_at_store' });
    expect(buildExchangeRequest({ ...base, newVariantId: null })).toMatchObject({ resolution: 'refund' });
  });

  it('desistência é sempre reembolso e defeito leva as fotos', () => {
    expect(buildExchangeRequest({ ...base, reason: 'regret', newVariantId: null })).toMatchObject({ type: 'withdrawal', resolution: 'refund' });
    const defect = buildExchangeRequest({ ...base, reason: 'defect', prefer: 'refund', photoIds: ['p1', 'p2'], note: ' riscado ' });
    expect(defect).toMatchObject({ type: 'defect', resolution: 'refund', photoIds: ['p1', 'p2'], description: 'riscado' });
  });

  it('o botão nunca começa inerte: o que falta é dito ao tocar', () => {
    expect(firstMissing({ reason: null }, true)?.message).toBe('Escolha o motivo.');
    expect(firstMissing({ reason: 'size', newVariantId: null }, true)?.message).toBe('Escolha o novo tamanho ou cor.');
    expect(firstMissing({ reason: 'size', newVariantId: null }, false)).toBeNull();
    expect(firstMissing({ reason: 'defect', photoIds: [] }, false)?.message).toBe('Adicione ao menos 1 foto.');
  });

  it('linha do tempo da troca e próximo passo vêm do estado do servidor', () => {
    expect(exchangeSteps('approved').map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(exchangeSteps('completed').every((s) => s.state === 'done')).toBe(true);
    const money = (c: number) => `R$ ${c / 100}`;
    const text = nextStepText({ status: 'awaiting_fee', method: 'pickup_at_home', answerDeadlineAt: '', feeDueAt: '2026-11-22T17:30:00Z', itemDueAt: null, totalDue: { amount: 1500, currency: 'BRL' }, refund: { amount: 0, currency: 'BRL' } }, money);
    expect(text).toContain('R$ 15');
  });
});
