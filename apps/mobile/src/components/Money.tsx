import { View } from 'react-native';
import { fonts } from '../theme/fonts';
import { theme } from '../theme';
import { Text } from './Text';

export type MoneySize = 'sm' | 'md' | 'lg' | 'xl';
const SIZES: Record<MoneySize, number> = { sm: 20, md: 28, lg: 44, xl: 68 };

export interface MoneyProps {
  cents: number;
  size?: MoneySize;
  color?: string;
  /** Preço que muda na tela (total, stepper) usa Figtree com dígitos tabulares, para não "dançar" (direcao-v3.md §4.1). */
  tabular?: boolean;
  testID?: string;
}

/** Preço v3: "R$" a 40% e centavos a 50% elevados, inteiro grande. A leitura diz o valor inteiro ("R$ 49,90"). */
export function Money({ cents, size = 'md', color = theme.color.text.primary, tabular = false, testID }: MoneyProps) {
  const total = Math.max(0, Math.round(cents));
  const whole = Math.floor(total / 100);
  const frac = String(total % 100).padStart(2, '0');
  const base = SIZES[size];
  const family = tabular ? fonts.extrabold : fonts.displayExtraBold;
  const spoken = `R$ ${whole.toLocaleString('pt-BR')},${frac}`;
  return (
    <View accessible accessibilityLabel={spoken} style={{ flexDirection: 'row', alignItems: 'flex-start' }} testID={testID}>
      <Text allowFontScaling={false} style={{ fontFamily: family, fontSize: Math.round(base * 0.4), lineHeight: Math.round(base * 0.5), color, marginTop: Math.round(base * 0.12), marginRight: 2 }}>
        R$
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontFamily: family, fontSize: base, lineHeight: Math.round(base * 1.05), letterSpacing: -base * 0.035, color, fontVariant: tabular ? ['tabular-nums'] : undefined }}
      >
        {whole.toLocaleString('pt-BR')}
      </Text>
      <Text allowFontScaling={false} style={{ fontFamily: family, fontSize: Math.round(base * 0.5), lineHeight: Math.round(base * 0.6), color, marginTop: Math.round(base * 0.06), letterSpacing: -base * 0.02 }}>
        ,{frac}
      </Text>
    </View>
  );
}
