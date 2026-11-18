import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Button } from './Button';
import type { IconComponent } from './icons';
import { MapPinLine, WarningCircle, WifiSlash } from './icons';
import { Text } from './Text';

interface StateShape {
  icon: IconComponent;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
  link?: ReactNode;
  testID?: string;
}

/** Molde único de vazio e erro: círculo `surface.sunken` 120 com ícone 64, título, texto e 1 ação (§3.1). */
function StateShell({ icon: Icon, title, text, actionLabel, onAction, link, testID }: StateShape) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.shell} testID={testID}>
      <View style={styles.circle}>
        <Icon color={theme.color.text.brand} size={theme.size.iconEmpty} weight="duotone" />
      </View>
      <Text variant="title2" style={styles.center}>
        {title}
      </Text>
      {text ? (
        <Text color="secondary" style={styles.center}>
          {text}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} size="lg" /> : null}
      {link}
    </View>
  );
}

export function EmptyState(props: Omit<StateShape, 'icon'> & { icon?: IconComponent }) {
  return <StateShell icon={MapPinLine} {...props} />;
}

export interface ErrorStateProps {
  title: string;
  text: string;
  onRetry?: () => void;
  retryLabel: string;
  offline?: boolean;
  testID?: string;
}

export function ErrorState({ title, text, onRetry, retryLabel, offline, testID }: ErrorStateProps) {
  return (
    <StateShell
      actionLabel={retryLabel}
      icon={offline ? WifiSlash : WarningCircle}
      testID={testID}
      text={text}
      title={title}
      {...(onRetry ? { onAction: onRetry } : {})}
    />
  );
}

const styles = StyleSheet.create({
  shell: { alignItems: 'center', gap: theme.space[3], padding: theme.space[6], alignSelf: 'stretch' },
  circle: {
    width: 120,
    height: 120,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.surface.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
