import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { t } from '../i18n';
import { theme } from '../theme';
import { Minus, Plus, Trash } from './icons';
import { Text } from './Text';

export interface QuantityStepperProps {
  value: number;
  max: number;
  onChange: (next: number) => void;
  /** Na sacola, o "−" em 1 vira lixeira "Remover" (onda-4 S1). */
  onRemove?: () => void;
  removeLabel?: string;
  /** `lg`: 56 de altura, para alinhar com o botão primário da barra do produto. */
  size?: 'md' | 'lg';
  testID?: string;
}

/** Stepper de 48 com − e + de 48x48. Máximo = estoque: "+" desabilitado (o aviso "Só 3 em estoque" é da tela). Ajustável para o leitor de tela. */
export function QuantityStepper({ value, max, onChange, onRemove, removeLabel, size = 'md', testID }: QuantityStepperProps) {
  const atMin = value <= 1;
  const atMax = value >= max;
  const label = t('product.qty', { n: value });
  return (
    <View
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max, now: value }}
      accessible
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && !atMax) onChange(value + 1);
        if (e.nativeEvent.actionName === 'decrement') {
          if (!atMin) onChange(value - 1);
          else onRemove?.();
        }
      }}
      style={[styles.wrap, size === 'lg' && styles.wrapLg]}
      testID={testID}
    >
      <Pressable
        accessibilityLabel={atMin && onRemove ? (removeLabel ?? t('common.cancel')) : t('product.qtyMinus')}
        accessibilityRole="button"
        disabled={atMin && !onRemove}
        hitSlop={theme.hitSlopFor(theme.size.touchMin)}
        onPress={() => {
          void haptic('selection');
          if (atMin) onRemove?.();
          else onChange(value - 1);
        }}
        style={styles.btn}
        testID={testID ? `${testID}-minus` : undefined}
      >
        {atMin && onRemove ? (
          <Trash color={theme.color.feedback.danger.base} size={theme.size.iconSm} />
        ) : (
          <Minus color={atMin ? theme.color.text.disabled : theme.color.text.primary} size={theme.size.iconSm} />
        )}
      </Pressable>
      <Text style={styles.value} variant="priceStrong">
        {value}
      </Text>
      <Pressable
        accessibilityLabel={t('product.qtyPlus')}
        accessibilityRole="button"
        disabled={atMax}
        hitSlop={theme.hitSlopFor(theme.size.touchMin)}
        onPress={() => {
          void haptic('selection');
          onChange(value + 1);
        }}
        style={styles.btn}
        testID={testID ? `${testID}-plus` : undefined}
      >
        <Plus color={atMax ? theme.color.text.disabled : theme.color.text.primary} size={theme.size.iconSm} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', height: theme.size.touchMin, borderRadius: theme.radius.button, borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.default, backgroundColor: theme.color.surface.card },
  wrapLg: { height: theme.size.controlLg },
  btn: { width: theme.size.touchMin, height: theme.size.touchMin, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 40, textAlign: 'center' },
});
