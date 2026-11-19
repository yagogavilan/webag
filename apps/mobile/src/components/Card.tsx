import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';

export interface CardProps {
  children: ReactNode;
  /** `ink`: superfície noite (faixa de ofertas, painel do pedido). `studio`: fundo de foto de produto. */
  tone?: 'card' | 'ink' | 'studio' | 'brand';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BG = { card: theme.color.surface.card, ink: theme.color.surface.ink, studio: theme.color.surface.studio, brand: theme.color.brand[500] } as const;

/** Cartão v3: raio 24, sem sombra (profundidade por cor e sobreposição; sombra com desfoque pesa em lista no Android). */
export function Card({ children, tone = 'card', padded = true, style, testID }: CardProps) {
  return (
    <View style={[styles.card, { backgroundColor: BG[tone] }, tone === 'card' && styles.border, padded && styles.padded, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: theme.radius.card, overflow: 'hidden' },
  border: { borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.subtle },
  padded: { padding: theme.space[4], gap: theme.space[3] },
});
