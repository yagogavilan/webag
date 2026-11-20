import { ApiError } from '../src/api/problem';
import { fromServer } from '../src/features/cart/model';
import { couponErrorMessage, deriveCta, firstBlockedIndex, hasAcknowledgeable } from '../src/features/cart/state';
import { serverCart, serverCartItem } from '../src/test/fixtures';

const view = (over: Record<string, unknown> = {}) => {
  const v = fromServer(serverCart(over) as never);
  if (!v) throw new Error('sacola vazia');
  return v;
};
const blocked = (...blockers: string[]) => view({ checkout: { canCheckout: false, blockers, opensAt: null } });

describe('deriveCta (S1: o botão nunca fica desabilitado sem motivo)', () => {
  it('normal: ir para o pagamento', () => {
    expect(deriveCta(view())).toMatchObject({ kind: 'pay', label: 'Ir para o pagamento', banner: null, inert: false });
  });

  it('loja fechada ganha da maioria dos bloqueios e é a única inerte', () => {
    const cta = deriveCta(blocked('BELOW_MINIMUM', 'STORE_CLOSED'));
    expect(cta).toMatchObject({ kind: 'closed', inert: true });
    expect(cta.banner?.testID).toBe('cart.closed-banner');
  });

  it('mínimo: mostra quanto falta e leva a adicionar itens', () => {
    const v = view({ checkout: { canCheckout: false, blockers: ['BELOW_MINIMUM'], opensAt: null }, summary: { ...serverCart().summary, missingForMinimum: { amount: 1200, currency: 'BRL' } } });
    const cta = deriveCta(v);
    expect(cta).toMatchObject({ kind: 'add-more', label: 'Adicionar mais itens' });
    expect(cta.banner?.text).toBe('Faltam R$ 12,00 para o pedido mínimo da loja.');
  });

  it.each([
    ['NEEDS_ADDRESS', 'change-address'],
    ['OUT_OF_RANGE', 'change-address'],
    ['PICKUP_UNAVAILABLE', 'add-more'],
    ['ABOVE_MAX_ORDER', 'remove-items'],
    ['ITEM_UNAVAILABLE', 'sold-out'],
  ])('%s -> %s', (blocker, kind) => {
    expect(deriveCta(blocked(blocker)).kind).toBe(kind);
  });
});

describe('avisos de item', () => {
  const warned = view({
    items: [serverCartItem({ warnings: [{ code: 'PRICE_CHANGED', message: 'x', fromCents: 1, toCents: 2 }] }), serverCartItem({ variantId: 'v2', available: false, quantity: 0, warnings: [{ code: 'OUT_OF_STOCK', message: 'x' }] })],
  });
  it('preço e estoque pedem aceite; esgotado pede remoção', () => {
    expect(hasAcknowledgeable(warned.lines)).toBe(true);
    expect(firstBlockedIndex(warned.lines)).toBe(1);
    expect(hasAcknowledgeable(view().lines)).toBe(false);
  });
});

describe('couponErrorMessage', () => {
  const problem = (status: number, code: string, detail?: string) => new ApiError({ kind: 'problem', status, code, ...(detail ? { detail } : {}) });
  it('usa o texto do servidor quando vem (traz data e valor)', () => {
    expect(couponErrorMessage(problem(422, 'COUPON_EXPIRED', 'Esse cupom venceu em 10 nov.'))).toBe('Esse cupom venceu em 10 nov.');
  });
  it('sem detalhe, cai no texto da spec por código', () => {
    expect(couponErrorMessage(problem(422, 'COUPON_NOT_FOUND'))).toBe('Esse cupom não existe. Confira o código.');
    expect(couponErrorMessage(problem(422, 'COUPON_OTHER_STORE'))).toBe('Esse cupom é de outra loja.');
  });
  it('limite de tentativas, sem rede e erro desconhecido', () => {
    expect(couponErrorMessage(problem(429, 'RATE_LIMITED'))).toBe('Muitas tentativas. Tente de novo mais tarde.');
    expect(couponErrorMessage(new ApiError({ kind: 'network' }))).toBe('Conecte-se para aplicar o cupom.');
    expect(couponErrorMessage(new Error('x'))).toBe('Não foi possível aplicar o cupom. Tente de novo.');
  });
});
