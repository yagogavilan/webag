import { rejectCoupon, type CouponContext, type CouponFacts } from './coupon.js';
import { commissionCents, couponFaceCents, serviceFeeCents, startingFee, summarize, type PricingInput } from './pricing.js';

const base = (over: Partial<PricingInput> = {}): PricingInput => ({ subtotalCents: 16_980, deliveryFeeCents: 500, serviceFeeCents: 200, coupon: null, commissionPct: 10, minTotalCents: 100, ...over });

describe('resumo de valores (RN-05, RN-09, RN-10)', () => {
  it('sem cupom: total = subtotal + frete + taxa de serviço, em centavos inteiros', () => {
    expect(summarize(base())).toMatchObject({ discountCents: 0, totalCents: 17_680, minimumTotalApplied: false });
  });

  it('cupom fixo, com o exemplo da spec: R$ 169,80 + 5,00 + 2,00 - 10,00 = R$ 166,80', () => {
    const r = summarize(base({ coupon: { kind: 'fixed', scope: 'store', value: 1000, percentCapCents: null } }));
    expect(r).toMatchObject({ discountCents: 1000, totalCents: 16_680 });
  });

  it('percentual arredonda meio para cima e respeita o teto; desconto nunca passa do subtotal', () => {
    expect(couponFaceCents({ kind: 'percent', scope: 'store', value: 15, percentCapCents: null }, 1_003, 0)).toBe(150); // 150,45 -> 150
    expect(couponFaceCents({ kind: 'percent', scope: 'store', value: 10, percentCapCents: null }, 1_005, 0)).toBe(101); // 100,5 -> 101
    expect(couponFaceCents({ kind: 'percent', scope: 'store', value: 50, percentCapCents: 1000 }, 10_000, 0)).toBe(1000);
    expect(couponFaceCents({ kind: 'fixed', scope: 'store', value: 9_999, percentCapCents: null }, 3_000, 0)).toBe(3_000);
    expect(couponFaceCents({ kind: 'percent', scope: 'store', value: 100, percentCapCents: null }, 3_000, 0)).toBe(3_000);
  });

  it('cupom que zeraria o total cobra o mínimo de R$ 1,00 e o desconto mostrado cai junto (HIP-037)', () => {
    const r = summarize(base({ subtotalCents: 1_000, deliveryFeeCents: 0, serviceFeeCents: 0, coupon: { kind: 'fixed', scope: 'store', value: 1_000, percentCapCents: null } }));
    expect(r).toMatchObject({ totalCents: 100, discountCents: 900, couponFaceCents: 1_000, minimumTotalApplied: true });
  });

  it('frete grátis desconta o frete; frete já zerado não gera desconto', () => {
    const coupon = { kind: 'free_shipping' as const, scope: 'platform' as const, value: 0, percentCapCents: null };
    expect(summarize(base({ coupon }))).toMatchObject({ discountCents: 500, totalCents: 17_180 });
    expect(summarize(base({ deliveryFeeCents: 0, coupon }))).toMatchObject({ discountCents: 0, totalCents: 17_180 });
  });

  it('cupom da plataforma é limitado à application_fee: comissão + entrega + serviço (WB-116 C6, DEC-016, DEC-036)', () => {
    const coupon = { kind: 'fixed' as const, scope: 'platform' as const, value: 5_000, percentCapCents: null };
    const r = summarize(base({ subtotalCents: 10_000, coupon })); // comissão 10% = 1.000 + entrega (ver `base`)
    expect(r).toMatchObject({ discountCents: 1_000 + base({}).deliveryFeeCents + base({}).serviceFeeCents, couponFaceCents: 5_000, platformDiscountCapped: true });
    expect(summarize(base({ subtotalCents: 10_000, coupon: { ...coupon, scope: 'store' } }))).toMatchObject({ discountCents: 5_000, platformDiscountCapped: false });
  });

  it('comissão arredonda meio para cima (RN-10): 10% de R$ 0,05 é R$ 0,01', () => {
    expect(commissionCents(5, 10)).toBe(1);
    expect(commissionCents(9_000, 10)).toBe(900);
    expect(commissionCents(1_005, 12.5)).toBe(126);
  });

  it('taxa de serviço: nenhuma, fixa em centavos e percentual em pontos-base', () => {
    expect(serviceFeeCents('nenhuma', 999, 10_000)).toBe(0);
    expect(serviceFeeCents('fixa', 200, 10_000)).toBe(200);
    expect(serviceFeeCents('percentual', 500, 10_000)).toBe(500);
    expect(serviceFeeCents('percentual', 250, 999)).toBe(25);
  });

  it('"a partir de" usa a menor faixa; taxa fixa devolve a fixa', () => {
    expect(startingFee('fixed', 700, [])).toBe(700);
    expect(startingFee('by_distance', 0, [{ feeCents: 900 }, { feeCents: 400 }])).toBe(400);
  });
});

describe('validação do cupom (WB-022 C2, RN-09)', () => {
  const day = 86_400_000;
  const now = new Date('2026-11-18T12:00:00Z');
  const coupon = (over: Partial<CouponFacts> = {}): CouponFacts => ({ kind: 'fixed', scope: 'store', storeId: 's1', minOrderCents: 8_000, startsAt: new Date(now.getTime() - day), endsAt: new Date(now.getTime() + day), maxUses: 10, perCustomerLimit: 1, firstPurchaseOnly: false, active: true, ...over });
  const ctx = (over: Partial<CouponContext> = {}): CouponContext => ({ now, cartStoreId: 's1', subtotalCents: 10_000, emailVerified: true, totalUses: 0, customerUses: 0, hasPaidOrder: true, isStoreMember: false, ...over });

  it('vale quando tudo bate', () => expect(rejectCoupon(coupon(), ctx())).toBeNull());
  it('inexistente, inativo, ainda não começou e vencido', () => {
    expect(rejectCoupon(null, ctx())).toBe('COUPON_NOT_FOUND');
    expect(rejectCoupon(coupon({ active: false }), ctx())).toBe('COUPON_NOT_FOUND');
    expect(rejectCoupon(coupon({ startsAt: new Date(now.getTime() + 1) }), ctx())).toBe('COUPON_NOT_STARTED');
    expect(rejectCoupon(coupon({ endsAt: now }), ctx())).toBe('COUPON_EXPIRED'); // o fim é exclusivo
  });
  it('esgotado, já usado, de outra loja e pedido mínimo', () => {
    expect(rejectCoupon(coupon(), ctx({ totalUses: 10 }))).toBe('COUPON_EXHAUSTED');
    expect(rejectCoupon(coupon(), ctx({ customerUses: 1 }))).toBe('COUPON_ALREADY_USED');
    expect(rejectCoupon(coupon(), ctx({ cartStoreId: 's2' }))).toBe('COUPON_OTHER_STORE');
    expect(rejectCoupon(coupon(), ctx({ subtotalCents: 7_999 }))).toBe('COUPON_MIN_ORDER');
    expect(rejectCoupon(coupon(), ctx({ subtotalCents: 8_000 }))).toBeNull();
  });
  it('plataforma e primeira compra exigem e-mail confirmado; primeira compra recusa quem já comprou; autoconsumo bloqueado', () => {
    expect(rejectCoupon(coupon({ scope: 'platform', storeId: null }), ctx({ emailVerified: false }))).toBe('COUPON_EMAIL_UNVERIFIED');
    expect(rejectCoupon(coupon({ firstPurchaseOnly: true }), ctx({ emailVerified: false }))).toBe('COUPON_EMAIL_UNVERIFIED');
    expect(rejectCoupon(coupon({ firstPurchaseOnly: true }), ctx({ hasPaidOrder: true }))).toBe('COUPON_FIRST_PURCHASE_ONLY');
    expect(rejectCoupon(coupon({ firstPurchaseOnly: true }), ctx({ hasPaidOrder: false }))).toBeNull();
    expect(rejectCoupon(coupon(), ctx({ isStoreMember: true }))).toBe('COUPON_NOT_ALLOWED');
    expect(rejectCoupon(coupon({ maxUses: null }), ctx({ totalUses: 9999 }))).toBeNull();
  });
});
