import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SemConexao, VazioBusca, VazioSacola } from '../art/kit.generated';
import { theme } from '../theme';
import { Button } from './Button';
import type { IconComponent } from './icons';
import { MapPin, WarningCircle } from './icons';
import { SpeedLines } from './SpeedLines';
import { Text } from './Text';

export type StateArt = 'bag' | 'search' | 'offline' | 'icon';

interface StateShape {
  icon?: IconComponent;
  /** Ilustração do kit v3. `icon` (padrão): ícone duotone num bloco noite com as barras da marca. */
  art?: StateArt;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
  link?: ReactNode;
  testID?: string;
}

/** Molde único de vazio, erro e offline (v3): ilustração do kit (sem rosto, sem humor em erro), título em Bricolage, texto e 1 ação. */
function StateShell({ icon: Icon = MapPin, art = 'icon', title, text, actionLabel, onAction, link, testID }: StateShape) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.shell} testID={testID}>
      <View style={styles.art}>
        {art === 'bag' ? <VazioSacola width={216} /> : null}
        {art === 'search' ? <VazioBusca width={216} /> : null}
        {art === 'offline' ? <SemConexao width={216} /> : null}
        {art === 'icon' ? (
          <View style={styles.iconArt}>
            <View style={styles.lines}>
              <SpeedLines thickness={6} />
            </View>
            <View style={styles.block}>
              <Icon color={theme.color.neutral[0]} duo={theme.color.accent.base} size={theme.size.iconEmpty} weight="duotone" />
            </View>
          </View>
        ) : null}
      </View>
      <Text style={styles.center} variant="title1">
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

export function EmptyState(props: StateShape) {
  return <StateShell {...props} />;
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
      art={offline ? 'offline' : 'icon'}
      icon={WarningCircle}
      testID={testID}
      text={text}
      title={title}
      {...(onRetry ? { onAction: onRetry } : {})}
    />
  );
}

const styles = StyleSheet.create({
  shell: { alignItems: 'center', gap: theme.space[3], padding: theme.space[6], alignSelf: 'stretch' },
  art: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', minHeight: 120 },
  iconArt: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', minHeight: 120 },
  block: { width: 120, height: 120, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface.ink, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  lines: { position: 'absolute', left: theme.space[4], top: theme.space[2], opacity: 0.8 },
  center: { textAlign: 'center' },
});
