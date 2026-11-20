import { describe, expect, it } from 'vitest';
import { discountPercent, effectivePrice, endOfMinute, isPromotionActive, validatePromotion, type Promotion } from './price.js';

// Promoção de 10:00 a 23:59 (horário de Brasília, UTC-3) do dia 2026-03-10: fim guardado como o último ms do minuto.
const promo: Promotion = {
  promoPriceCents: 800,
  promoStartsAt: new Date('2026-03-10T13:00:00.000Z'),
  promoEndsAt: endOfMinute(new Date('2026-03-11T02:59:00.000Z')),
};

describe('preço vigente (RN-05, O2-PRC-01/03)', () => {
  it('antes do início vale o normal; no instante do início vale o promocional', () => {
    expect(effectivePrice(1000, null, promo, new Date('2026-03-10T12:59:59.999Z')).priceCents).toBe(1000);
    expect(effectivePrice(1000, null, promo, new Date('2026-03-10T13:00:00.000Z')).priceCents).toBe(800);
  });

  it('borda de fuso: 23:59:59 BRT (02:59:59Z do dia seguinte) ainda é promoção; 00:00:00 BRT (03:00:00Z) volta ao normal sem job', () => {
    expect(isPromotionActive(promo, new Date('2026-03-11T02:59:59.000Z'))).toBe(true);
    expect(isPromotionActive(promo, new Date('2026-03-11T02:59:59.999Z'))).toBe(true);
    expect(isPromotionActive(promo, new Date('2026-03-11T03:00:00.000Z'))).toBe(false);
    expect(effectivePrice(1000, null, promo, new Date('2026-03-11T03:00:00.000Z'))).toEqual({ priceCents: 1000, originalCents: null, discountPct: null });
  });

  it('mostra "de/por" com o percentual arredondado para baixo', () => {
    expect(effectivePrice(1000, null, promo, new Date('2026-03-10T15:00:00Z'))).toEqual({ priceCents: 800, originalCents: 1000, discountPct: 20 });
    expect(discountPercent(3000, 2000)).toBe(33); // 33,33% -> 33%
    expect(discountPercent(1000, 996)).toBeNull(); // 0,4% não é exibido
    expect(discountPercent(1000, 990)).toBe(1);
  });

  it('variação com preço próprio herda o DESCONTO PERCENTUAL, nunca o preço promocional absoluto', () => {
    const result = effectivePrice(1000, 2000, promo, new Date('2026-03-10T15:00:00Z'));
    expect(result.priceCents).toBe(1600);
    expect(result.originalCents).toBe(2000);
  });

  it('a promoção nunca deixa o preço em R$ 0,00 nem acima do normal', () => {
    const tiny = effectivePrice(1000, 1, { ...promo, promoPriceCents: 1 }, new Date('2026-03-10T15:00:00Z'));
    expect(tiny.priceCents).toBeGreaterThanOrEqual(1);
    const above = effectivePrice(1000, null, { ...promo, promoPriceCents: 1200 }, new Date('2026-03-10T15:00:00Z'));
    expect(above).toEqual({ priceCents: 1000, originalCents: null, discountPct: null });
  });

  it('promoção incompleta (sem fim) não vale', () => {
    expect(isPromotionActive({ ...promo, promoEndsAt: null }, new Date('2026-03-10T15:00:00Z'))).toBe(false);
    expect(isPromotionActive({ promoPriceCents: null, promoStartsAt: null, promoEndsAt: null }, new Date())).toBe(false);
  });
});

describe('validação da promoção (O2-PRC-02)', () => {
  const ok: Promotion = { promoPriceCents: 999, promoStartsAt: new Date('2026-03-10T10:00:00Z'), promoEndsAt: new Date('2026-03-11T10:00:00Z') };

  it('normal - 1 centavo é aceito; igual ou maior, R$ 0,00 e fim antes do início são recusados', () => {
    expect(validatePromotion(1000, ok)).toBeNull();
    expect(validatePromotion(1000, { ...ok, promoPriceCents: 1000 })).not.toBeNull();
    expect(validatePromotion(1000, { ...ok, promoPriceCents: 0 })).not.toBeNull();
    expect(validatePromotion(1000, { ...ok, promoEndsAt: new Date('2026-03-09T10:00:00Z') })).not.toBeNull();
  });

  it('sem nenhum campo de promoção é válido; com campos pela metade é recusado', () => {
    expect(validatePromotion(1000, { promoPriceCents: null, promoStartsAt: null, promoEndsAt: null })).toBeNull();
    expect(validatePromotion(1000, { ...ok, promoStartsAt: null })).not.toBeNull();
  });

  it('endOfMinute fixa o fim no último milissegundo do minuto informado (R-13)', () => {
    expect(endOfMinute(new Date('2026-03-11T02:59:12.345Z')).toISOString()).toBe('2026-03-11T02:59:59.999Z');
  });
});
