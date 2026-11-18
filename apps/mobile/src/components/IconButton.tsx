import { Pressable, StyleSheet } from 'react-native';
import { type ReactNode } from 'react';
import { theme } from '../theme';
import type { IconComponent } from './icons';

export interface IconButtonProps {
  icon: IconComponent;
  /** Obrigatório: ícone sozinho não diz nada ao leitor de tela ("Abrir sacola, 2 itens"). */
  label: string;
  onPress: () => void;
  weight?: 'regular' | 'fill' | 'bold';
  color?: string;
  /** Sobre foto: círculo claro com a sombra do scrim, para manter o contraste (7:1) nos ícones sobre a capa. */
  overPhoto?: boolean;
  /** Contador ou marca no canto (ex.: itens da sacola). Já deve estar descrito no `label`. */
  corner?: ReactNode;
  disabled?: boolean;
  testID?: string;
}

/** Botão só de ícone com alvo de 48 (ícone de 24 + hitSlop). Contador opcional no canto. */
export function IconButton({ icon: Icon, label, onPress, weight = 'regular', color, overPhoto, corner, disabled, testID }: IconButtonProps) {
  const tint = color ?? theme.color.text.primary;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      android_ripple={{ color: theme.color.action.primarySubtlePressed, borderless: true }}
      disabled={disabled}
      hitSlop={theme.hitSlopFor(theme.size.iconMd)}
      onPress={onPress}
      style={[styles.btn, overPhoto && styles.overPhoto]}
      testID={testID}
    >
      <Icon color={tint} size={theme.size.iconMd} weight={weight} />
      {corner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: theme.size.touchMin, height: theme.size.touchMin, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.full },
  overPhoto: { backgroundColor: theme.color.surface.card, opacity: 0.95, ...theme.shadows.sm },
});
