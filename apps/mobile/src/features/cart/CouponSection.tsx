import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { CaretDown, CaretUp, Tag, X } from '../../components/icons';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';
import type { CartView } from './model';

export interface CouponSectionProps {
  coupon: CartView['coupon'];
  discountCents: number;
  online: boolean;
  /** Visitante: o cupom exige conta (limite por usuário); o toque leva a entrar. */
  guest: boolean;
  /** Devolve a mensagem de erro, ou `null` quando aplicou. */
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => Promise<void>;
  onGuest: () => void;
}

/** Cupom (S1): linha "Tem um cupom?" que abre campo + "Aplicar"; aplicado vira chip com "Remover". */
export function CouponSection({ coupon, discountCents, online, guest, onApply, onRemove, onGuest }: CouponSectionProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (coupon) {
    const rejected = !coupon.applied;
    return (
      <View style={styles.wrap}>
        <View style={styles.chip} testID="cart.coupon-chip">
          <Tag color={theme.color.action.primary} duo={theme.color.brand[300]} size={theme.size.iconSm} weight="duotone" />
          <Text accessibilityLabel={rejected ? t('cart.couponRejected', { code: coupon.code }) : t('cart.couponChip', { code: coupon.code, value: formatMoney(discountCents) })} style={styles.chipText} variant="label">
            {rejected ? coupon.code : t('cart.couponChip', { code: coupon.code, value: formatMoney(discountCents) })}
          </Text>
          <Pressable
            accessibilityLabel={t('cart.couponRemove')}
            accessibilityRole="button"
            disabled={busy}
            hitSlop={theme.hitSlopFor(theme.size.iconSm)}
            onPress={() => {
              setBusy(true);
              void onRemove().finally(() => setBusy(false));
            }}
            style={styles.remove}
            testID="cart.coupon-remove"
          >
            <X color={theme.color.text.secondary} size={theme.size.iconSm} />
          </Pressable>
        </View>
        {rejected ? (
          <Text accessibilityLiveRegion="polite" color="danger" testID="cart.coupon-error" variant="caption">
            {coupon.rejection ?? t('cart.couponGeneric')}
          </Text>
        ) : null}
      </View>
    );
  }

  const apply = async () => {
    const value = code.trim();
    if (!value || busy) return;
    if (!online) {
      setError(t('cart.couponOffline'));
      return;
    }
    setBusy(true);
    setError(null);
    const message = await onApply(value);
    setBusy(false);
    if (message) setError(message);
    else {
      setCode('');
      setOpen(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel={t('cart.couponToggle')}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => (guest ? onGuest() : setOpen((v) => !v))}
        style={styles.toggle}
        testID="cart.coupon-toggle"
      >
        <Tag color={theme.color.action.primary} duo={theme.color.brand[300]} size={theme.size.iconMd} weight="duotone" />
        <Text style={styles.chipText} variant="label">
          {t('cart.couponToggle')}
        </Text>
        {open ? <CaretUp color={theme.color.text.secondary} size={theme.size.iconSm} /> : <CaretDown color={theme.color.text.secondary} size={theme.size.iconSm} />}
      </Pressable>
      {open ? (
        <View style={styles.form}>
          <TextField autoCapitalize="characters" autoCorrect={false} error={error ?? undefined} label={t('cart.couponLabel')} maxLength={32} onChangeText={(v) => { setCode(v); setError(null); }} onSubmitEditing={() => void apply()} returnKeyType="done" testID="cart.coupon-input" value={code} />
          <Button label={t('cart.couponApply')} loading={busy} onPress={() => void apply()} testID="cart.coupon-apply" variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space[2], paddingVertical: theme.space[2] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], minHeight: theme.size.touchMin },
  chip: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], minHeight: theme.size.touchMin, paddingLeft: theme.space[3], borderRadius: theme.radius.lg, backgroundColor: theme.color.action.primarySubtle },
  chipText: { flex: 1 },
  remove: { alignItems: 'center', justifyContent: 'center', minWidth: theme.size.touchMin, minHeight: theme.size.touchMin },
  form: { gap: theme.space[3] },
});
