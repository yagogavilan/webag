import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { theme } from '../theme';
import { Check } from './icons';
import { Text } from './Text';

export interface RadioListItemProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /** Ação à direita (ex.: menu de 3 pontos); fica FORA da área tocável da linha. */
  trailing?: ReactNode;
  /** Ícone à esquerda. */
  leading?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

/** Linha de lista de 72 com seleção por borda + check (não só cor) e papel de rádio para o leitor de tela (D3). */
export function RadioListItem({ title, subtitle, selected, onPress, trailing, leading, accessibilityLabel, testID }: RadioListItemProps) {
  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <Pressable
        accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, selected }}
        android_ripple={{ color: theme.color.action.primarySubtlePressed }}
        onPress={() => {
          void haptic('selection');
          onPress();
        }}
        style={styles.main}
        testID={testID}
      >
        {leading}
        <View style={styles.texts}>
          <Text variant="bodyStrong">{title}</Text>
          {subtitle ? (
            <Text color="secondary" variant="caption">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {selected ? <Check color={theme.color.text.brand} size={theme.size.iconMd} weight="bold" /> : null}
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.color.border.default,
    backgroundColor: theme.color.surface.card,
    overflow: 'hidden',
  },
  rowSelected: { borderColor: theme.color.border.focus, borderWidth: theme.borderWidth.strong, backgroundColor: theme.color.surface.brandSubtle },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space[3], padding: theme.space[3], minHeight: 72 },
  texts: { flex: 1 },
});
