import type { OrderSummary } from '@webag/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { RemoteImage } from '../../components/RemoteImage';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';
import { logoFallback } from '../catalog/image';
import { coverColor } from '../catalog/StoreRow';
import { firstItemLabel, formatDateTime, formatHour, isActive, itemCountLabel, presentStatus, summaryA11y, summaryEta } from './model';

export interface OrderRowProps {
  order: OrderSummary;
  onPress: () => void;
  onPay?: () => void;
  onReorder?: () => void;
  onHelp?: () => void;
}

/** Linha de Meus pedidos (spec S8): logo, loja, selo, "Caixa de som +1" (ativo) ou data (anterior), faixa de chegada se houver, total. Lida inteira como uma frase. */
export function OrderRow({ order, onPress, onPay, onReorder, onHelp }: OrderRowProps) {
  const status = presentStatus(order.status);
  // Pedido ativo: o que é e (se o servidor mandou a faixa) quando chega. Anteriores: data e quantidade de itens.
  const active = isActive(order.status);
  const eta = active ? summaryEta(order) : null;
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
        <RemoteImage alt="" fallback={logoFallback(order.store.name, coverColor(order.store.id))} height={48} radius={14} urls={order.store.logo.urls} width={48} />
        <View style={styles.texts}>
          <Text numberOfLines={1} variant="bodyStrong">
            {order.store.name}
          </Text>
          <Badge icon={status.icon} label={status.label} tone={status.tone} />
          <Text color="secondary" numberOfLines={1} testID={`orders.detail-${order.id}`} variant="caption">
            {active ? firstItemLabel(order) : `${formatDateTime(order.createdAt)} · ${itemCountLabel(order.itemCount)}`}
          </Text>
          {eta?.fromAt && eta.toAt ? (
            <Text testID={`orders.eta-${order.id}`} variant="captionStrong">
              {t('order.arrivesBetween', { start: formatHour(eta.fromAt), end: formatHour(eta.toAt) })}
            </Text>
          ) : null}
        </View>
        <Text variant="priceStrong">{formatMoney(order.total.amount)}</Text>
      </Pressable>
      {onPay ? (
        <Button accessibilityLabel={t('orders.payA11y', { store: order.store.name })} label={`${t('orders.pixPending')} · ${t('orders.pay')}`} onPress={onPay} testID={`orders.pay-pix-${order.id}`} variant="text" />
      ) : null}
      <View style={styles.actions}>
        {onReorder ? <Button label={t('order.reorder')} onPress={onReorder} testID={`orders.reorder-${order.id}`} variant="ink" /> : null}
        {onHelp ? <Button accessibilityLabel={t('orders.helpA11y', { store: order.store.name })} label={t('orders.help')} onPress={onHelp} testID={`orders.help-${order.id}`} variant="text" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border.subtle },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], paddingBottom: theme.space[3] },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: theme.space[3], paddingVertical: theme.space[3] },
  texts: { flex: 1, gap: theme.space[1], alignItems: 'flex-start' },
});
