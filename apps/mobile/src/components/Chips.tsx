import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { theme } from '../theme';
import { Check } from './icons';
import { Text } from './Text';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  testID?: string;
}

export interface ChipsProps<T extends string> {
  label: string;
  options: readonly ChipOption<T>[];
  value: T | null;
  /** Tocar no chip marcado desmarca (apelido é opcional). */
  onChange: (next: T | null) => void;
}

/** Escolha única por chips (apelido do endereço). Selecionado = borda + check + fundo, não só cor; alvo de 48. */
export function Chips<T extends string>({ label, options, value, onChange }: ChipsProps<T>) {
  return (
    <View accessibilityLabel={label} accessibilityRole="radiogroup" style={styles.group}>
      <Text variant="captionStrong">{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              key={option.value}
              onPress={() => {
                void haptic('selection');
                onChange(selected ? null : option.value);
              }}
              style={[styles.chip, selected && styles.chipSelected]}
              testID={option.testID}
            >
              {selected ? <Check color={theme.color.text.brand} size={theme.size.iconSm} weight="bold" /> : null}
              <Text color={selected ? 'brand' : 'primary'} variant="label">
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: theme.space[2] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] },
  chip: {
    minHeight: theme.size.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
    paddingHorizontal: theme.space[4],
    borderRadius: theme.radius.full,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.color.border.strong,
    backgroundColor: theme.color.surface.card,
  },
  chipSelected: { borderColor: theme.color.border.focus, borderWidth: theme.borderWidth.strong, backgroundColor: theme.color.surface.brandSubtle },
});
