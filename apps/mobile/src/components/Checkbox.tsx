import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { theme } from '../theme';
import { Check, Warning } from './icons';
import { Text } from './Text';

export interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Frase completa: vira o rótulo de acessibilidade (WB-210, region.consent). */
  label: string;
  children?: ReactNode;
  error?: string | undefined;
  testID?: string;
}

/** Caixa real (nunca texto solto), alvo de 48, estado por borda + check (não só cor). */
export function Checkbox({ checked, onChange, label, children, error, testID }: CheckboxProps) {
  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => {
          void haptic('selection');
          onChange(!checked);
        }}
        style={styles.row}
        testID={testID}
      >
        <View
          style={[
            styles.box,
            checked && styles.boxChecked,
            error ? { borderColor: theme.color.border.danger } : null,
          ]}
        >
          {checked ? <Check color={theme.color.text.onBrand} size={theme.size.iconSm} weight="bold" /> : null}
        </View>
        <View style={styles.content}>{children ?? <Text>{label}</Text>}</View>
      </Pressable>
      {error ? (
        <View accessible accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.messageRow}>
          <Warning color={theme.color.text.danger} size={theme.size.iconSm} weight="fill" />
          <Text variant="caption" color="danger" style={styles.message}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: theme.space[1] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[3], minHeight: theme.size.touchMin, paddingVertical: theme.space[2] },
  box: {
    width: theme.size.iconMd,
    height: theme.size.iconMd,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borderWidth.strong,
    borderColor: theme.color.border.strong,
    backgroundColor: theme.color.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space[1],
  },
  boxChecked: { backgroundColor: theme.color.action.primary, borderColor: theme.color.action.primary },
  content: { flex: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[1] },
  message: { flexShrink: 1 },
});
