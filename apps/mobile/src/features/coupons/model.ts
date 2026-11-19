import type { MyCoupon, OrderCompensation } from '@webag/shared';
import { t } from '../../i18n';
import { formatMoney, formatWhen } from '../../lib/format';

/** "Vence em breve": faltam até 48 h (design X5). */
export const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;

type Benefit = { kind: MyCoupon['kind']; valueCents: number | null; percent?: number | null };

/** O benefício em palavras, só com o que o servidor mandou (valor e tipo nunca fixos no app). */
export function benefitLabel(c: Benefit): string {
  if (c.kind === 'free_shipping') return t('coupons.freeShipping');
  if (c.kind === 'fixed') return c.valueCents != null ? t('coupons.fixed', { value: formatMoney(c.valueCents) }) : t('coupons.fixedNoValue');
  return c.percent != null ? t('coupons.percent', { percent: c.percent }) : t('coupons.percentNoValue');
}

export const isExpiringSoon = (c: Pick<MyCoupon, 'status' | 'expiresAt'>, now: number): boolean => {
  if (c.status !== 'available') return false;
  const left = Date.parse(c.expiresAt) - now;
  return left > 0 && left <= EXPIRING_SOON_MS;
};

export const minOrderLabel = (c: Pick<MyCoupon, 'minOrderCents'>): string | null => (c.minOrderCents > 0 ? t('coupons.minOrder', { value: formatMoney(c.minOrderCents) }) : null);

export const validityLabel = (c: Pick<MyCoupon, 'status' | 'expiresAt'>): string => {
  const day = formatWhen(c.expiresAt, { time: false });
  if (c.status === 'used') return t('coupons.used');
  if (c.status === 'expired') return t('coupons.expired', { day });
  return t('coupons.validUntil', { day });
};

export const couponA11y = (c: MyCoupon, now: number): string =>
  [c.code, benefitLabel(c), minOrderLabel(c), validityLabel(c), isExpiringSoon(c, now) ? t('coupons.expiringSoon') : null].filter(Boolean).join(', ');

/**
 * Bilhete da tela do pedido (onda-7-eta-atraso.md §3.7): o texto do benefício, o prazo do servidor (`validUntil`, nunca "30 dias" fixo)
 * e a pergunta de uso. `null` = nada a mostrar (sem compensação).
 */
export function compensationNote(c: NonNullable<OrderCompensation>): { title: string; body: string } {
  const title = c.kind === 'free_shipping' ? t('comp.freeTitle') : c.valueCents != null ? t('comp.valueTitle', { value: formatMoney(c.valueCents) }) : t('comp.valueTitleNoValue');
  const day = formatWhen(c.validUntil, { time: false });
  if (c.status === 'used') return { title, body: t('comp.usedBody') };
  if (c.status === 'expired') return { title, body: t('comp.expiredBody', { day }) };
  return { title, body: c.kind === 'fixed' ? t('comp.valueBody', { day }) : t('comp.freeBody', { day }) };
}
