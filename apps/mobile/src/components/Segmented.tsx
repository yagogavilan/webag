import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { theme } from '../theme';
import { Text } from './Text';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  testID?: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

/** Controle segmentado de 2 a 3 opções (Entrega | Retirada, Lojas | Produtos). Selecionado = fundo + borda, não só cor. */
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <View accessibilityLabel={label} accessibilityRole="tablist" style={styles.group}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => {
              if (selected) return;
              void haptic('selection');
              onChange(option.value);
            }}
            style={[styles.item, selected && styles.itemSelected]}
            testID={option.testID}
          >
            <Text color={selected ? 'brand' : 'secondary'} variant="label">
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.full, padding: theme.space[1] },
  item: { flex: 1, minHeight: theme.size.touchMin - theme.space[2], alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.full, borderWidth: theme.borderWidth.strong, borderColor: 'transparent' },
  itemSelected: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.focus },
});
