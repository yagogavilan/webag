import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { Info } from '../../components/icons';
import { Text, type TextProps } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';
import type { CartSummaryView } from './model';

function Row({ label, value, a11yValue, variant = 'body', accessory, testID }: { label: string; value: string; a11yValue?: string; variant?: TextProps['variant']; accessory?: React.ReactNode; testID?: string }) {
  return (
    <View accessible accessibilityLabel={`${label}, ${a11yValue ?? value}`} style={styles.row} testID={testID}>
      <View style={styles.label}>
        <Text variant={variant}>{label}</Text>
        {accessory}
      </View>
      <Text variant={variant}>{value}</Text>
    </View>
  );
}

export interface PriceSummaryProps {
  summary: CartSummaryView;
  couponCode?: string | undefined;
  pickup: boolean;
}

/**
 * Resumo (RN-05): cada linha é o que o servidor calculou; o app não soma nada. Entrega "Grátis", "a partir de" com endereço
 * aproximado, taxa de serviço com explicação, cupom e total, na ordem da spec S1.
 */
export function PriceSummary({ summary, couponCode, pickup }: PriceSummaryProps) {
  const [feeOpen, setFeeOpen] = useState(false);
  const delivery = pickup
    ? t('cart.free')
    : summary.freeShipping || summary.deliveryCents === 0
      ? t('cart.free')
      : summary.deliveryEstimated
        ? t('cart.deliveryFrom', { value: formatMoney(summary.deliveryCents) })
        : formatMoney(summary.deliveryCents);
  return (
    <View style={styles.wrap} testID="cart.summary">
      <Row label={t('cart.subtotal')} testID="cart.subtotal" value={formatMoney(summary.subtotalCents)} />
      <Row label={pickup ? t('cart.pickup') : t('cart.delivery')} testID="cart.delivery" value={delivery} />
      {summary.serviceFeeCents > 0 ? (
        <Row
          accessory={
            <Pressable accessibilityLabel={t('cart.serviceFeeInfo')} accessibilityRole="button" hitSlop={theme.hitSlopFor(theme.size.iconSm)} onPress={() => setFeeOpen(true)} style={styles.info} testID="cart.service-fee-info">
              <Info color={theme.color.text.secondary} size={theme.size.iconSm} />
            </Pressable>
          }
          label={t('cart.serviceFee')}
          value={formatMoney(summary.serviceFeeCents)}
        />
      ) : null}
      {summary.discountCents > 0 ? <Row label={couponCode ? `${t('cart.coupon')} ${couponCode}` : t('cart.coupon')} testID="cart.discount" value={`− ${formatMoney(summary.discountCents)}`} a11yValue={`menos ${formatMoney(summary.discountCents)}`} /> : null}
      {summary.minimumTotalApplied ? (
        <Text color="secondary" variant="caption">
          {t('cart.minimumTotal')}
        </Text>
      ) : null}
      <View style={styles.divider} />
      <Row a11yValue={formatMoney(summary.totalCents)} label={t('cart.total')} testID="cart.summary-total" value={formatMoney(summary.totalCents)} variant="title1" />
      <BottomSheet onClose={() => setFeeOpen(false)} title={t('cart.serviceFeeTitle')} visible={feeOpen}>
        <Text>{t('cart.serviceFeeText')}</Text>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space[2], paddingVertical: theme.space[3] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space[3], minHeight: theme.space[6] },
  label: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1], flexShrink: 1 },
  info: { alignItems: 'center', justifyContent: 'center', minWidth: theme.size.touchMin, minHeight: theme.size.touchMin, marginVertical: -theme.space[3] },
  divider: { height: theme.borderWidth.hairline, backgroundColor: theme.color.border.default },
});
