import { collectionFeeCents, DAY_MS, evaluateEligibility, isSlaExpired, priceDifferenceCents, refundCents, windowDays, type EligibilityInput } from './eligibility.js';

const delivered = new Date('2026-12-01T12:00:00Z');
const base = (over: Partial<EligibilityInput> = {}): EligibilityInput => ({
  type: 'size_color',
  deliveredAt: delivered,
  now: new Date(delivered.getTime() + 2 * DAY_MS),
  storeVoluntaryDays: 7,
  productNoVoluntaryExchange: false,
  productDurable: true,
  voluntaryExchangesInOrder: 0,
  voluntaryLimitPerOrder: 1,
  itemAlreadyExchanged: false,
  openRequestForItem: false,
  ...over,
});
const at = (days: number, extraMs = 0) => new Date(delivered.getTime() + days * DAY_MS + extraMs);

describe('prazos da troca contam da ENTREGA (RN-11, DEC-037)', () => {
  it('arrependimento: 7 dias corridos, fixo; o limite exato ainda vale e 1 ms depois não', () => {
    expect(evaluateEligibility(base({ type: 'withdrawal', now: at(7) }))).toMatchObject({ eligible: true, days: 7 });
    expect(evaluateEligibility(base({ type: 'withdrawal', now: at(7, 1) }))).toMatchObject({ eligible: false, reason: 'WINDOW_EXPIRED' });
    // a loja desligar a troca voluntária NÃO desliga o arrependimento
    expect(evaluateEligibility(base({ type: 'withdrawal', storeVoluntaryDays: 0 })).eligible).toBe(true);
  });

  it('defeito: 30 dias (não durável) ou 90 (durável), pisos fixos que a loja não altera', () => {
    expect(windowDays({ type: 'defect', productDurable: false, storeVoluntaryDays: 0 })).toBe(30);
    expect(windowDays({ type: 'defect', productDurable: true, storeVoluntaryDays: 0 })).toBe(90);
    expect(evaluateEligibility(base({ type: 'defect', productDurable: false, now: at(30) })).eligible).toBe(true);
    expect(evaluateEligibility(base({ type: 'defect', productDurable: false, now: at(31) })).eligible).toBe(false);
    expect(evaluateEligibility(base({ type: 'defect', productDurable: true, now: at(90) })).eligible).toBe(true);
    expect(evaluateEligibility(base({ type: 'defect', productDurable: true, now: at(91) })).eligible).toBe(false);
    expect(evaluateEligibility(base({ type: 'defect', storeVoluntaryDays: 0, productNoVoluntaryExchange: true })).eligible).toBe(true); // "sem troca voluntária" não afeta defeito
  });

  it('tamanho/cor: prazo da loja; 0 não aceita; produto "sem troca voluntária"; 1 por pedido; item já trocado', () => {
    expect(evaluateEligibility(base({ now: at(7) }))).toMatchObject({ eligible: true, days: 7 });
    expect(evaluateEligibility(base({ now: at(7, 1) }))).toMatchObject({ eligible: false, reason: 'WINDOW_EXPIRED' });
    expect(evaluateEligibility(base({ storeVoluntaryDays: 0 }))).toMatchObject({ eligible: false, reason: 'STORE_NO_VOLUNTARY' });
    expect(evaluateEligibility(base({ productNoVoluntaryExchange: true }))).toMatchObject({ eligible: false, reason: 'PRODUCT_NO_VOLUNTARY' });
    expect(evaluateEligibility(base({ voluntaryExchangesInOrder: 1 }))).toMatchObject({ eligible: false, reason: 'VOLUNTARY_LIMIT' });
    expect(evaluateEligibility(base({ voluntaryExchangesInOrder: 1, voluntaryLimitPerOrder: 2 })).eligible).toBe(true);
    expect(evaluateEligibility(base({ itemAlreadyExchanged: true }))).toMatchObject({ eligible: false, reason: 'ALREADY_EXCHANGED' });
    // arrependimento e defeito não contam no limite de trocas voluntárias
    expect(evaluateEligibility(base({ type: 'withdrawal', voluntaryExchangesInOrder: 5 })).eligible).toBe(true);
  });

  it('sem entrega confirmada não há troca; uma solicitação aberta por item', () => {
    expect(evaluateEligibility(base({ deliveredAt: null }))).toMatchObject({ eligible: false, reason: 'NOT_DELIVERED' });
    expect(evaluateEligibility(base({ openRequestForItem: true }))).toMatchObject({ eligible: false, reason: 'OPEN_REQUEST' });
  });

  it('a data limite devolvida é a da entrega + prazo (a tela mostra "Você tem até DD/MM")', () => {
    const r = evaluateEligibility(base({ type: 'withdrawal' }));
    expect(r.eligible && r.deadline.toISOString()).toBe('2026-12-08T12:00:00.000Z');
  });
});

describe('SLA da loja, taxa de coleta, diferença de preço e reembolso (DEC-037)', () => {
  it('sem resposta em 24 h a troca é aprovada pelo sistema', () => {
    const requested = new Date('2026-12-05T10:00:00Z');
    expect(isSlaExpired(requested, 24, new Date('2026-12-06T09:59:59Z'))).toBe(false);
    expect(isSlaExpired(requested, 24, new Date('2026-12-06T10:00:00Z'))).toBe(true);
  });

  it('taxa de coleta: só tamanho/cor, só depois da aprovação, só em casa; levar à loja é grátis; arrependimento e defeito nunca cobram', () => {
    const fee = (over: Partial<Parameters<typeof collectionFeeCents>[0]>) => collectionFeeCents({ type: 'size_color', method: 'pickup_at_home', tableExchangeFeeCents: 450, approved: true, ...over });
    expect(fee({})).toBe(450);
    expect(fee({ approved: false })).toBe(0); // HIP-D09: só após a aprovação
    expect(fee({ method: 'drop_at_store' })).toBe(0);
    expect(fee({ type: 'withdrawal' })).toBe(0);
    expect(fee({ type: 'defect' })).toBe(0);
  });

  it('diferença de preço: positiva o cliente paga, negativa a Webag estorna', () => {
    expect(priceDifferenceCents(12_990, 9_990)).toBe(3_000);
    expect(priceDifferenceCents(8_990, 9_990)).toBe(-1_000);
    expect(priceDifferenceCents(9_990, 9_990)).toBe(0);
  });

  it('reembolso de arrependimento inclui a taxa de entrega paga; defeito e tamanho/cor só os itens', () => {
    expect(refundCents({ type: 'withdrawal', itemsCents: 8_000, deliveryFeePaidCents: 800 })).toBe(8_800);
    expect(refundCents({ type: 'defect', itemsCents: 8_000, deliveryFeePaidCents: 800 })).toBe(8_000);
    expect(refundCents({ type: 'size_color', itemsCents: 8_000, deliveryFeePaidCents: 800 })).toBe(8_000);
  });
});
