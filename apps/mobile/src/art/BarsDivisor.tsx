import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';

/** Divisor de barras (kit/barras-divisor.svg): 3 pílulas inclinadas -8 graus + fio. No máximo 1 por dobra (resumo da sacola, preço). */
export function BarsDivisor() {
  const lean = { transform: [{ skewX: `${theme.shape.lean}deg` }] };
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.row}>
      <View style={[styles.bar, { width: 18, backgroundColor: theme.color.surface.ink }, lean]} />
      <View style={[styles.bar, { width: 40, backgroundColor: theme.color.brand[500] }, lean]} />
      <View style={[styles.bar, { width: 10, backgroundColor: theme.color.surface.ink }, lean]} />
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: theme.space[3] },
  bar: { height: 6, borderRadius: 3 },
  line: { flex: 1, height: 1, backgroundColor: theme.color.border.subtle },
});
