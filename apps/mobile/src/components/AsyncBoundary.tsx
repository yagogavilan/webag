import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { useOnline } from '../lib/useOnline';
import { theme } from '../theme';
import { Button } from './Button';
import { ErrorState } from './StateViews';
import { Text } from './Text';

const SLOW_AFTER_MS = 8_000;

export interface AsyncBoundaryProps {
  isLoading: boolean;
  isError: boolean;
  isEmpty?: boolean;
  onRetry: () => void;
  /** Forma idêntica ao conteúdo. Sem spinner de tela cheia. */
  skeleton: ReactNode;
  empty?: ReactNode;
  children: ReactNode;
}

/**
 * Os quatro estados de toda tela (carregando, vazio, erro, sem conexão) num lugar só (WB-035, design-system.md §5).
 * Cache primeiro: com dado em cache o chamador passa isLoading=false e o skeleton não aparece.
 */
export function AsyncBoundary({ isLoading, isError, isEmpty, onRetry, skeleton, empty, children }: AsyncBoundaryProps) {
  const online = useOnline();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [isLoading]);

  if (isLoading) {
    return (
      <View accessibilityLabel={t('common.loading')} accessibilityLiveRegion="polite" style={styles.fill}>
        {skeleton}
        {slow ? (
          <View style={styles.slow}>
            <Text color="secondary" style={styles.center}>
              {t('states.slow')}
            </Text>
            <Button label={t('common.tryAgain')} onPress={onRetry} variant="secondary" />
          </View>
        ) : null}
      </View>
    );
  }
  if (isError) {
    return !online ? (
      <ErrorState offline onRetry={onRetry} retryLabel={t('common.tryAgain')} text={t('states.offlineText')} title={t('states.offlineTitle')} />
    ) : (
      <ErrorState onRetry={onRetry} retryLabel={t('common.tryAgain')} text={t('states.errorText')} title={t('states.errorTitle')} />
    );
  }
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  slow: { gap: theme.space[2], paddingTop: theme.space[4] },
  center: { textAlign: 'center' },
});
