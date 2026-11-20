import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import type { IconComponent } from './icons';
import { Text, type TextColor } from './Text';

export type BadgeTone = 'success' | 'neutral' | 'brand' | 'info' | 'danger' | 'warning';

const TONES: Record<BadgeTone, { bg: string; text: TextColor; icon: string }> = {
  success: { bg: theme.color.feedback.success.subtle, text: 'success', icon: theme.color.feedback.success.base },
  neutral: { bg: theme.color.surface.sunken, text: 'secondary', icon: theme.color.text.secondary },
  brand: { bg: theme.color.surface.brandSubtle, text: 'brand', icon: theme.color.text.brand },
  info: { bg: theme.color.feedback.info.subtle, text: 'info', icon: theme.color.feedback.info.base },
  danger: { bg: theme.color.feedback.danger.subtle, text: 'danger', icon: theme.color.feedback.danger.base },
  warning: { bg: theme.color.feedback.warning.subtle, text: 'warning', icon: theme.color.feedback.warning.base },
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconComponent;
  testID?: string;
}

/** Selo (§3.1): 24 de altura, raio 4, ícone de 16 + texto `micro`. Sempre ícone ou texto: nunca só cor. Não interativo. */
export function Badge({ label, tone = 'neutral', icon: Icon, testID }: BadgeProps) {
  const spec = TONES[tone];
  return (
    <View accessible accessibilityLabel={label} style={[styles.badge, { backgroundColor: spec.bg }]} testID={testID}>
      {Icon ? <Icon color={spec.icon} size={16} weight="bold" /> : null}
      <Text color={spec.text} variant="micro">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
    paddingHorizontal: theme.space[2],
    borderRadius: theme.radius.pill,
    alignSelf: 'flex-start',
  },
});
