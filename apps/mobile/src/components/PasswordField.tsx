import { Pressable, StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { passwordStrength } from '../lib/password';
import { theme } from '../theme';
import { Eye, EyeSlash } from './icons';
import { Text } from './Text';
import { TextField, type TextFieldProps } from './TextField';

export interface PasswordFieldProps extends Omit<TextFieldProps, 'secureTextEntry' | 'accessory' | 'mask'> {
  visible: boolean;
  /** Sem esta função o olho não aparece (campo "Confirmar senha": um único olho controla os dois, DEC-012). */
  onToggleVisible?: () => void;
  /** Senha nova (cadastro, redefinir) ou atual (login). Define o autofill dos gerenciadores de senha. */
  mode: 'new' | 'current';
  showMeter?: boolean;
  toggleTestID?: string;
}

export function PasswordField({ visible, onToggleVisible, mode, showMeter, toggleTestID, value, ...rest }: PasswordFieldProps) {
  const fillProps =
    mode === 'new'
      ? ({ autoComplete: 'new-password', textContentType: 'newPassword', passwordRules: 'minlength: 8; maxlength: 128; required: lower; required: digit;' } as const)
      : ({ autoComplete: 'current-password', textContentType: 'password' } as const);

  return (
    <View style={styles.wrapper}>
      <TextField
        accessory={
          onToggleVisible ? (
            <Pressable
              accessibilityLabel={visible ? t('common.hidePassword') : t('common.showPassword')}
              accessibilityRole="button"
              accessibilityState={{ selected: visible }}
              hitSlop={theme.hitSlopFor(theme.size.iconMd)}
              onPress={onToggleVisible}
              style={styles.eye}
              testID={toggleTestID ?? 'auth.password-toggle'}
            >
              {visible ? <EyeSlash color={theme.color.text.secondary} size={theme.size.iconMd} /> : <Eye color={theme.color.text.secondary} size={theme.size.iconMd} />}
            </Pressable>
          ) : null
        }
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!visible}
        spellCheck={false}
        value={value}
        {...fillProps}
        {...rest}
      />
      {showMeter && value ? <StrengthMeter password={value} /> : null}
    </View>
  );
}

/** 4 segmentos + palavra "Fraca", "Média" ou "Forte": nunca só cor (§3.1). */
export function StrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  const word = t(`password.${label}`);
  const color = label === 'weak' ? theme.color.feedback.danger.base : label === 'medium' ? theme.color.feedback.warning.base : theme.color.feedback.success.base;
  return (
    <View
      accessibilityLabel={`${t('password.strengthLabel')}: ${word.toLowerCase()}`}
      accessibilityLiveRegion="polite"
      accessible
      style={styles.meter}
      testID="auth.password-meter"
    >
      <View style={styles.segments}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={[styles.segment, { backgroundColor: n <= score ? color : theme.color.border.default }]} />
        ))}
      </View>
      <Text color={label === 'weak' ? 'danger' : label === 'medium' ? 'warning' : 'success'} variant="captionStrong">
        {word}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: theme.space[2] },
  eye: { width: theme.size.touchMin, height: theme.size.touchMin, alignItems: 'center', justifyContent: 'center' },
  meter: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3] },
  segments: { flexDirection: 'row', gap: theme.space[1], flex: 1 },
  segment: { flex: 1, height: theme.space[1], borderRadius: theme.radius.full },
});
