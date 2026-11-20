import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { QuantityStepper } from '../../components/QuantityStepper';
import { RemoteImage } from '../../components/RemoteImage';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';
import { productFallback } from '../catalog/image';
import { Price } from '../catalog/Price';
import type { CartLine } from './model';
import { warningText } from './state';

const THUMB = theme.size.avatarMd + theme.space[4];

export interface CartLineItemProps {
  line: CartLine;
  /** Quantidade mostrada (já com o toque do cliente, antes da resposta do servidor). */
  quantity: number;
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: (line: CartLine) => void;
}

/** Linha da sacola (S1): miniatura 72, nome, variação, preço, stepper com lixeira em 1 e aviso do item. */
function CartLineItemBase({ line, quantity, onQuantity, onRemove }: CartLineItemProps) {
  const warning = warningText(line);
  const unavailable = !line.available;
  const total = formatMoney(line.unitPriceCents * quantity);
  return (
    <View style={styles.wrap} testID={`cart.item-${line.key}`}>
      <View
        accessible
        accessibilityLabel={[line.name, line.variantLabel, unavailable ? t('cart.warnSoldOut') : `${quantity} x ${formatMoney(line.unitPriceCents)}, ${t('cart.itemTotal', { value: total })}`].filter(Boolean).join(', ')}
        style={styles.row}
      >
        <RemoteImage alt={line.name} fallback={productFallback(line.name)} height={THUMB} radius={theme.radius.lg} urls={line.urls} width={THUMB} />
        <View style={styles.texts}>
          <Text numberOfLines={2} variant="bodyStrong">
            {line.name}
          </Text>
          {line.variantLabel ? (
            <Text color="secondary" numberOfLines={1} variant="caption">
              {line.variantLabel}
            </Text>
          ) : null}
          {unavailable ? null : <Price cents={line.unitPriceCents} originalCents={line.originalPriceCents} />}
        </View>
      </View>
      {unavailable ? null : (
        <View style={styles.actions}>
          <QuantityStepper max={Math.max(1, line.maxQuantity)} onChange={(n) => onQuantity(line, n)} onRemove={() => onRemove(line)} removeLabel={t('cart.remove', { name: line.name })} testID={`cart.item-${line.key}-qty`} value={quantity} />
          <Text variant="priceStrong">{total}</Text>
        </View>
      )}
      {warning ? (
        <View accessibilityLiveRegion="polite" style={styles.warning} testID={`cart.item-${line.key}-warning`}>
          <Banner text={warning.text} tone={warning.tone} />
        </View>
      ) : null}
      {unavailable ? <Button accessibilityLabel={t('cart.remove', { name: line.name })} label={t('cart.removeShort')} onPress={() => onRemove(line)} testID={`cart.item-${line.key}-remove`} variant="secondary" /> : null}
    </View>
  );
}

export const CartLineItem = memo(CartLineItemBase);

const styles = StyleSheet.create({
  wrap: { gap: theme.space[2], paddingVertical: theme.space[3], borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border.default },
  row: { flexDirection: 'row', gap: theme.space[3] },
  texts: { flex: 1, gap: theme.space[1] },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space[3] },
  warning: { paddingTop: theme.space[1] },
});
