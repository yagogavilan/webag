import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'destructive';
export type ButtonSize = 'lg' | 'md';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Enviando: mostra spinner, fica inerte e anuncia "ocupado". Largura se mantém. */
  loading?: boolean;
  /** Rótulo alternativo enquanto carrega ("Entrando…"). */
  loadingLabel?: string;
  icon?: ReactNode;
  /** Sobre fundo escuro (toast): texto na cor `text.inverseAction`. */
  onInverse?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Botão do design system (§3.1). Em formulários ele NUNCA começa desabilitado: o erro aparece ao tocar (DEC-024d).
 * `disabled` é só para inércia com motivo no rótulo (ex.: "Tente às 14:47").
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  icon,
  onInverse,
  disabled,
  onPress,
  style,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const inert = Boolean(disabled) || loading;
  const textColor = onInverse
    ? theme.color.text.inverseAction
    : variant === 'primary' || variant === 'destructive'
      ? theme.color.text.onBrand
      : theme.color.text.brand;
  const shownLabel = loading && loadingLabel ? loadingLabel : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? shownLabel}
      accessibilityState={{ disabled: inert, busy: loading }}
      android_ripple={{ color: theme.color.action.primarySubtlePressed }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        variantStyle(variant, pressed, Boolean(disabled)),
        loading && styles.loading,
        style,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={textColor} size="small" /> : icon}
        <Text
          variant="label"
          style={[
            { color: disabled ? theme.color.action.disabledText : textColor },
            styles.label,
          ]}
        >
          {shownLabel}
        </Text>
      </View>
    </Pressable>
  );
}

function variantStyle(variant: ButtonVariant, pressed: boolean, disabled: boolean): ViewStyle {
  if (disabled) {
    return { backgroundColor: theme.color.action.disabledFill, borderColor: 'transparent' };
  }
  switch (variant) {
    case 'primary':
      return { backgroundColor: pressed ? theme.color.action.primaryPressed : theme.color.action.primary };
    case 'destructive':
      return { backgroundColor: pressed ? theme.color.action.destructivePressed : theme.color.action.destructive };
    case 'secondary':
      return {
        backgroundColor: pressed ? theme.color.action.primarySubtle : 'transparent',
        borderColor: theme.color.action.secondaryBorder,
        borderWidth: theme.borderWidth.strong,
      };
    case 'text':
      return { backgroundColor: pressed ? theme.color.action.primarySubtle : 'transparent' };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.pill,
    minWidth: 96,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[2],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  md: { minHeight: theme.size.controlMd },
  lg: { minHeight: theme.size.controlLg, alignSelf: 'stretch' },
  loading: { opacity: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space[2] },
  label: { textAlign: 'center', flexShrink: 1 },
});
