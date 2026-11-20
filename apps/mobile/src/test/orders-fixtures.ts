import type { Exchange, Order, OrderPayment, OrderSummary } from '@webag/shared';

const money = (amount: number) => ({ amount, currency: 'BRL' as const });

/** Pedido do contrato com valores plausíveis; `over` sobrescreve o que o teste precisa. */
export function orderFixture(over: Partial<Order> = {}): Order {
  return {
    tracking: null,
    id: '11111111-1111-4111-8111-111111111111',
    number: '#1042',
    status: 'received',
    mode: 'delivery',
    createdAt: '2026-11-18T17:32:00Z',
    updatedAt: '2026-11-18T17:33:00Z',
    store: { id: 's1', name: 'Casa Bela', logo: { urls: {} } as never, whatsapp: '11987654321' },
    items: [{ productId: 'p1', variantId: 'v1', name: 'Camiseta Básica', attributes: { Tamanho: 'M' }, image: { urls: {} } as never, quantity: 1, unitPrice: money(8990), lineTotal: money(8990) }],
    summary: { subtotal: money(8990), delivery: money(590), deliveryEstimated: false, freeShipping: false, serviceFee: money(199), discount: money(0), total: money(9779), minimumTotalApplied: false, platformDiscountCapped: false, missingForMinimum: null },
    couponCode: null,
    delivery: { address: { id: 'a1', label: 'home', cep: '07900000', street: 'Rua das Palmeiras', number: '120', complement: null, neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', cityId: null, lat: 0, lng: 0, isDefault: true, createdAt: '2026-11-01T00:00:00Z' } as never, etaMinMinutes: 30, etaMaxMinutes: 45 },
    pickup: null,
    payment: { method: 'pix', status: 'approved' },
    exchangePolicy: { voluntaryDays: 7, collectionFeeCents: 500, version: 1 },
    timeline: [
      { status: 'received', at: '2026-11-18T17:33:00Z', actor: 'system', reason: null },
      { status: 'accepted', at: '2026-11-18T17:35:00Z', actor: 'store', reason: null },
    ],
    allowedActions: ['cancel', 'contact_store'],
    cancellation: null,
    ...over,
  } as Order;
}

export function paymentFixture(over: Partial<OrderPayment> = {}): OrderPayment {
  return {
    method: 'pix',
    status: 'pending',
    amount: money(9779),
    pix: { copyPaste: '00020126TESTE-PIX-COPIA-E-COLA', qrCodeBase64: null, expiresAt: new Date(Date.now() + 14 * 60_000).toISOString() },
    installments: 1,
    declineReason: null,
    updatedAt: '2026-11-18T17:32:00Z',
    ...over,
  } as OrderPayment;
}

export function summaryFixture(over: Partial<OrderSummary> = {}): OrderSummary {
  return { id: '11111111-1111-4111-8111-111111111111', number: '#1042', status: 'accepted', mode: 'delivery', store: { id: 's1', name: 'Casa Bela', logo: { urls: {} } as never }, itemCount: 3, firstItemName: 'Camiseta', firstItemImage: { urls: {} } as never, total: money(16680), createdAt: '2026-11-18T17:32:00Z', ...over } as OrderSummary;
}

export function exchangeFixture(over: Partial<Exchange> = {}): Exchange {
  return {
    id: 'x1',
    number: 'TR-1042',
    orderId: '11111111-1111-4111-8111-111111111111',
    orderNumber: '#1042',
    status: 'requested',
    type: 'size_color',
    reasonCode: 'size',
    method: 'drop_at_store',
    resolution: 'replace',
    quantity: 1,
    item: { orderItemId: 'oi1', name: 'Camiseta Básica' },
    fee: money(0),
    difference: money(0),
    totalDue: money(0),
    refund: money(0),
    answerDeadlineAt: '2026-11-20T17:30:00Z',
    windowEndsAt: '2026-11-25T17:30:00Z',
    createdAt: '2026-11-18T17:32:00Z',
    updatedAt: '2026-11-18T17:32:00Z',
    ...over,
  } as Exchange;
}
