import { type ReactNode } from 'react';
import { StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { BarsLoader } from '../art/Bars';
import { Pressy } from '../motion';
import { theme } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'destructive' | 'onBrand' | 'onBrandText' | 'ink' | 'onInk';
export type ButtonSize = 'lg' | 'md';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Enviando: as 3 barras da marca no lugar do ícone, botão inerte e "ocupado" anunciado. Largura se mantém. */
  loading?: boolean;
  /** Rótulo alternativo enquanto carrega ("Entrando…"). */
  loadingLabel?: string;
  icon?: ReactNode;
  /** Valor à direita do rótulo ("Adicionar    R$ 79,90"): tira a dúvida "quanto vou pagar" (direcao-v3.md §4.4). */
  value?: string;
  /** Aparência de inativo, mas ainda recebe o toque (para explicar o que falta: "Escolha o tamanho"). Anunciado como desabilitado. */
  muted?: boolean;
  /** Sobre fundo escuro (toast): texto na cor `text.inverseAction`. */
  onInverse?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Botão do design system v3: raio 16, 56 de altura (md 48), ação #A21FBE com texto branco (6,0:1), rótulo à esquerda e valor à direita.
 * Em formulários ele NUNCA começa desabilitado: o erro aparece ao tocar (DEC-024d). `disabled` é só para inércia com motivo no rótulo.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  icon,
  value,
  onInverse,
  muted = false,
  disabled,
  onPress,
  style,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const inert = Boolean(disabled) || loading;
  const spec = palette(variant, Boolean(disabled) || muted, Boolean(onInverse));
  const shownLabel = loading && loadingLabel ? loadingLabel : label;
  return (
    <Pressy
      accessibilityLabel={accessibilityLabel ?? (value ? `${shownLabel}, ${value}` : shownLabel)}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert || muted, busy: loading }}
      android_ripple={{ color: spec.ripple }}
      disabled={inert}
      feedback="light"
      onPress={onPress}
      style={[styles.base, size === 'lg' ? styles.lg : styles.md, { backgroundColor: spec.bg }, spec.border ? { borderColor: spec.border, borderWidth: theme.borderWidth.strong } : null, style]}
      {...rest}
    >
      <View style={[styles.row, value ? styles.spread : styles.center]}>
        <View style={styles.left}>
          {loading ? <BarsLoader color={spec.fg} style={styles.loader} /> : icon}
          <Text style={[styles.label, { color: spec.fg }]} variant="label">
            {shownLabel}
          </Text>
        </View>
        {value ? (
          <Text style={[styles.value, { color: spec.fg }]} variant="priceStrong">
            {value}
          </Text>
        ) : null}
      </View>
    </Pressy>
  );
}

interface Spec {
  bg: string;
  fg: string;
  border?: string;
  ripple: string;
}

function palette(variant: ButtonVariant, disabled: boolean, onInverse: boolean): Spec {
  const c = theme.color;
  if (disabled) return { bg: c.action.disabledFill, fg: c.action.disabledText, ripple: 'transparent' };
  if (onInverse) return { bg: 'transparent', fg: c.text.inverseAction, ripple: c.action.primaryPressed };
  switch (variant) {
    case 'primary':
      return { bg: c.action.primary, fg: c.text.onBrand, ripple: c.action.primaryPressed };
    case 'destructive':
      return { bg: c.action.destructive, fg: c.text.onBrand, ripple: c.action.destructivePressed };
    case 'secondary':
      return { bg: 'transparent', fg: c.text.brand, border: c.action.secondaryBorder, ripple: c.action.primarySubtlePressed };
    case 'text':
      return { bg: 'transparent', fg: c.text.brand, ripple: c.action.primarySubtlePressed };
    // Sobre o roxo da marca: branco com texto noite (o texto branco pequeno sobre #C02EF0 reprova AA).
    case 'onBrand':
      return { bg: c.neutral[0], fg: c.neutral[900], ripple: c.brand[100] };
    case 'onBrandText':
      return { bg: 'transparent', fg: c.neutral[0], ripple: c.action.primaryPressed };
    // Estado "feito" e barra da sacola: noite com rótulo lima.
    case 'ink':
      return { bg: c.surface.ink, fg: c.accent.base, ripple: c.neutral[800] };
    // Ação sobre fundo noite: lima com texto noite (15,3:1).
    case 'onInk':
      return { bg: c.accent.base, fg: c.accent.onBase, ripple: c.neutral[0] };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.button,
    minWidth: 96,
    paddingHorizontal: theme.space[5],
    paddingVertical: theme.space[2],
    justifyContent: 'center',
    overflow: 'hidden',
  },
  md: { minHeight: theme.size.controlMd },
  lg: { minHeight: theme.size.controlLg, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2] },
  spread: { justifyContent: 'space-between' },
  center: { justifyContent: 'center' },
  left: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], flexShrink: 1 },
  loader: { transform: [{ scale: 0.5 }], width: 28, height: 18, marginLeft: -6 },
  label: { textAlign: 'center', flexShrink: 1 },
  value: { fontVariant: ['tabular-nums'] },
});
