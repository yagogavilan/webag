import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { t } from '../i18n';
import { onlyDigits } from '../lib/masks';
import { theme } from '../theme';
import { Text } from './Text';
import type { TextFieldRef } from './TextField';

export const OTP_LENGTH = 6;

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Chamado uma vez ao completar o 6º dígito (verifica sozinho, sem botão). */
  onComplete: (code: string) => void;
  hasError?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Código de 6 dígitos: 6 caixas 48x56 sobre UM campo de texto transparente. Um campo só garante colar o código inteiro,
 * preenchimento automático (`oneTimeCode`/`one-time-code`) e Backspace corretos no Android e no iOS.
 * Leitor de tela: 1 campo "Código de 6 dígitos" (menos gestos que 6 campos); as caixas são só visuais.
 */
export function OtpInput({ value, onChange, onComplete, hasError, disabled, autoFocus = true }: OtpInputProps) {
  const inputRef = useRef<TextFieldRef>(null);

  const handle = (raw: string) => {
    const digits = onlyDigits(raw).slice(0, OTP_LENGTH);
    onChange(digits);
    if (digits.length === OTP_LENGTH) onComplete(digits);
  };

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row} testID="auth.otp-input">
      {Array.from({ length: OTP_LENGTH }, (_, i) => {
        const char = value[i];
        const active = i === Math.min(value.length, OTP_LENGTH - 1);
        return (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            key={i}
            style={[
              styles.box,
              active && !disabled && styles.boxActive,
              hasError && { borderColor: theme.color.border.danger },
            ]}
            testID={`auth.otp-digit-${i + 1}`}
          >
            <Text accessibilityLabel={t('otp.digit', { n: i + 1 })} variant="title1">
              {char ?? ''}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        accessibilityHint={t('otp.validFor')}
        accessibilityLabel={t('otp.fieldLabel', { n: value.length })}
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        caretHidden
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        onChangeText={handle}
        selection={{ start: value.length, end: value.length }}
        style={styles.hidden}
        testID="auth.otp-field"
        textContentType="oneTimeCode"
        value={value}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: theme.space[2] },
  box: {
    width: theme.size.touchMin,
    height: theme.size.controlLg,
    borderRadius: theme.radius.control,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.color.border.strong,
    backgroundColor: theme.color.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: theme.color.border.focus, borderWidth: theme.borderWidth.strong },
  hidden: { ...StyleSheet.absoluteFill, color: 'transparent', backgroundColor: 'transparent', opacity: 0.02 },
});
