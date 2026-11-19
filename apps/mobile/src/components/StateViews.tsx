import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Button } from './Button';
import type { IconComponent } from './icons';
import { MapPinLine, WarningCircle, WifiSlash } from './icons';
import { SpeedLines } from './SpeedLines';
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

/** Molde único de vazio e erro (identidade v2): tile `tile.1` 120 com ícone duotone 64 e as linhas de velocidade da marca, título, texto e 1 ação. */
function StateShell({ icon: Icon, title, text, actionLabel, onAction, link, testID }: StateShape) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.shell} testID={testID}>
      <View style={styles.art}>
        <View style={styles.lines}>
          <SpeedLines thickness={6} />
        </View>
        <View style={styles.circle}>
          <Icon color={theme.color.text.brand} size={theme.size.iconEmpty} weight="duotone" />
        </View>
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
    backgroundColor: theme.color.tile[1],
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', minHeight: 120 },
  lines: { position: 'absolute', left: theme.space[4], top: theme.space[2], opacity: 0.8 },
  center: { textAlign: 'center' },
});
