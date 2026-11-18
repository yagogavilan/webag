import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Button } from './Button';
import { CheckCircle, Info, Warning, WarningCircle } from './icons';
import { Text } from './Text';

export type BannerTone = 'success' | 'warning' | 'danger' | 'info';

export interface BannerProps {
  tone: BannerTone;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Segunda linha menor (ex.: "Código enviado para ..."). */
  footer?: ReactNode;
  testID?: string;
}

const ICONS = { success: CheckCircle, warning: Warning, danger: WarningCircle, info: Info } as const;

/** Aviso inline: fundo `*.subtle`, borda `*.border`, ícone + texto + ação (§3.1). Erro e alerta são anunciados na hora. */
export function Banner({ tone, text, actionLabel, onAction, footer, testID }: BannerProps) {
  const palette = theme.color.feedback[tone];
  const Icon = ICONS[tone];
  const urgent = tone === 'danger' || tone === 'warning';
  return (
    <View
      accessible={urgent}
      accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}
      accessibilityRole={urgent ? 'alert' : undefined}
      style={[styles.box, { backgroundColor: palette.subtle, borderColor: palette.border }]}
      testID={testID}
    >
      <View style={styles.row}>
        <Icon color={palette.base} size={theme.size.iconMd} weight="fill" />
        <Text style={styles.text} variant="body">
          {text}
        </Text>
      </View>
      {footer}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="text" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: theme.borderWidth.hairline, borderRadius: theme.radius.md, padding: theme.space[3], gap: theme.space[2] },
  row: { flexDirection: 'row', gap: theme.space[2], alignItems: 'flex-start' },
  text: { flex: 1 },
  action: { alignSelf: 'flex-start' },
});
