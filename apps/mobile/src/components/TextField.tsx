import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '../theme';
import { Warning } from './icons';
import { Text } from './Text';

export type TextFieldRef = ComponentRef<typeof TextInput>;

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'onChangeText' | 'ref'> {
  ref?: Ref<TextFieldRef>;
  label: string;
  error?: string | undefined;
  help?: string | undefined;
  /** Máscara aplicada a cada digitação (ver lib/masks.ts). */
  mask?: (value: string) => string;
  onChangeText?: (value: string) => void;
  /** Conteúdo à direita dentro do campo (ex.: olho da senha). Precisa respeitar alvo de 48. */
  accessory?: ReactNode;
}

/**
 * Campo de texto (§3.1): rótulo sempre visível acima, 56 de altura em formulário de mobile, erro com ícone + texto
 * (nunca só cor), erro ligado ao campo por `accessibilityHint`. Placeholder nunca faz papel de rótulo.
 */
export function TextField({ label, error, help, mask, onChangeText, accessory, onFocus, onBlur, editable = true, ref, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? theme.color.border.danger
    : focused
      ? theme.color.border.focus
      : theme.color.border.strong;

  return (
    <View style={styles.wrapper}>
      <Text variant="captionStrong" color="primary" style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.box,
          { borderColor, borderWidth: focused || error ? theme.borderWidth.strong : theme.borderWidth.hairline },
          !editable && styles.disabled,
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error}
          editable={editable}
          maxFontSizeMultiplier={theme.maxFont.default}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onChangeText={(value) => onChangeText?.(mask ? mask(value) : value)}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          placeholderTextColor={theme.color.text.disabled}
          selectionColor={theme.color.border.focus}
          style={styles.input}
          {...rest}
        />
        {accessory}
      </View>
      {error ? (
        <View accessible accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.messageRow}>
          <Warning color={theme.color.text.danger} size={theme.size.iconSm} weight="fill" />
          <Text variant="caption" color="danger" style={styles.message}>
            {error}
          </Text>
        </View>
      ) : help ? (
        <Text variant="caption" color="secondary" style={styles.message}>
          {help}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: theme.space[1] },
  label: {},
  box: {
    minHeight: theme.size.controlLg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.space[3],
  },
  disabled: { backgroundColor: theme.color.surface.sunken },
  input: {
    ...theme.text.body,
    flex: 1,
    color: theme.color.text.primary,
    minHeight: theme.size.controlLg,
    paddingVertical: theme.space[2],
    paddingRight: theme.space[3],
  },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[1] },
  message: { flexShrink: 1 },
});
