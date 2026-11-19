import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Pressy } from '../motion';
import { theme } from '../theme';
import type { IconComponent } from './icons';

export interface IconButtonProps {
  icon: IconComponent;
  /** Obrigatório: ícone sozinho não diz nada ao leitor de tela ("Abrir sacola, 2 itens"). */
  label: string;
  onPress: () => void;
  weight?: 'regular' | 'fill' | 'bold' | 'duotone';
  color?: string;
  /** Cor da camada de fundo do duotone. */
  duo?: string;
  /** Sobre foto ou bloco de cor: quadrado claro (raio 14), mantém o contraste do ícone. */
  overPhoto?: boolean;
  /** Fundo do quadrado (noite sobre o roxo, por exemplo). */
  tone?: 'plain' | 'soft' | 'ink';
  /** Contador ou marca no canto (ex.: itens da sacola). Já deve estar descrito no `label`. */
  corner?: ReactNode;
  disabled?: boolean;
  testID?: string;
}

/** Botão só de ícone v3: quadrado de 44 com raio 14 (hitSlop até 48), conversa com o trapézio do símbolo. */
export function IconButton({ icon: Icon, label, onPress, weight = 'regular', color, duo, overPhoto, tone = 'plain', corner, disabled, testID }: IconButtonProps) {
  const tint = color ?? (tone === 'ink' ? theme.color.neutral[0] : theme.color.text.primary);
  return (
    <Pressy
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      android_ripple={{ color: theme.color.action.primarySubtlePressed, borderless: true }}
      disabled={disabled}
      feedback="selection"
      hitSlop={theme.hitSlopFor(44)}
      onPress={onPress}
      style={[styles.btn, tone === 'soft' && styles.soft, tone === 'ink' && styles.ink, overPhoto && styles.overPhoto]}
      testID={testID}
    >
      <Icon color={tint} duo={duo} size={theme.size.iconMd} weight={weight} />
      {corner}
    </Pressy>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.control },
  soft: { backgroundColor: theme.color.surface.sunken },
  ink: { backgroundColor: theme.color.surface.ink },
  overPhoto: { backgroundColor: theme.color.surface.card },
});
