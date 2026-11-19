import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';

export interface SpeedLinesProps {
  /** Cor das 3 linhas (as do símbolo v4a). Padrão: brand.300, decorativo. */
  color?: string;
  /** Altura de cada linha; as larguras seguem a proporção do símbolo (23, 49 e 34 de 49). */
  thickness?: number;
}

const WIDTHS = [0.47, 1, 0.69] as const;
const OFFSETS = [0.49, 0, 0.37] as const;

/** Linhas de velocidade da marca (as barras do símbolo v4a) para estados vazio, erro e offline. Só decoração. */
export function SpeedLines({ color = theme.color.brand[300], thickness = 8 }: SpeedLinesProps) {
  const total = thickness * 12;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.box, { width: total, gap: thickness }]}>
      {WIDTHS.map((w, i) => (
        <View
          key={i}
          style={{
            height: thickness,
            borderRadius: theme.radius.full,
            backgroundColor: color,
            width: total * w,
            marginLeft: total * (OFFSETS[i] ?? 0),
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: 'flex-start' } });
