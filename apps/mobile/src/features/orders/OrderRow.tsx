import type { OrderSummary } from '@webag/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { RemoteImage } from '../../components/RemoteImage';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';
import { formatDateTime, itemCountLabel, presentStatus, summaryA11y } from './model';

export interface OrderRowProps {
  order: OrderSummary;
  onPress: () => void;
  onPay?: () => void;
  onReorder?: () => void;
}

/** Linha de Meus pedidos (spec S8): logo, loja, selo, data e itens, total. Lida inteira como uma frase. */
export function OrderRow({ order, onPress, onPay, onReorder }: OrderRowProps) {
  const status = presentStatus(order.status);
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel={summaryA11y(order)}
        accessibilityRole="button"
        android_ripple={{ color: theme.color.action.primarySubtlePressed }}
        onPress={onPress}
        style={styles.row}
        testID={`orders.item-${order.id}`}
      >
        <RemoteImage alt="" height={40} radius={theme.radius.lg} urls={order.store.logo.urls} width={40} />
        <View style={styles.texts}>
          <Text numberOfLines={1} variant="bodyStrong">
            {order.store.name}
          </Text>
          <Badge icon={status.icon} label={status.label} tone={status.tone} />
          <Text color="secondary" variant="caption">
            {`${formatDateTime(order.createdAt)} · ${itemCountLabel(order.itemCount)}`}
          </Text>
        </View>
        <Text variant="price">{formatMoney(order.total.amount)}</Text>
      </Pressable>
      {onPay ? (
        <Button accessibilityLabel={t('orders.payA11y', { store: order.store.name })} label={`${t('orders.pixPending')} · ${t('orders.pay')}`} onPress={onPay} testID={`orders.pay-pix-${order.id}`} variant="text" />
      ) : null}
      {onReorder ? <Button label={t('order.reorder')} onPress={onReorder} testID={`orders.reorder-${order.id}`} variant="text" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border.subtle },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: theme.space[3], paddingVertical: theme.space[3] },
  texts: { flex: 1, gap: theme.space[1], alignItems: 'flex-start' },
});
