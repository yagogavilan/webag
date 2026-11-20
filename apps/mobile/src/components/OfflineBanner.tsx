import { StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { useOnline } from '../lib/useOnline';
import { theme } from '../theme';
import { WifiSlash } from './icons';
import { Text } from './Text';

/** Faixa "Sem conexão" sob o header (WB-035 C1). O conteúdo já carregado continua visível. */
export function OfflineBanner({ message = t('states.offlineBanner') }: { message?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.bar} testID="offline-banner">
      <WifiSlash color={theme.color.feedback.warning.base} size={theme.size.iconMd} />
      <Text color="warning" style={styles.text} variant="caption">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    backgroundColor: theme.color.feedback.warning.subtle,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.color.feedback.warning.border,
    paddingHorizontal: theme.layout.screenPaddingX,
    paddingVertical: theme.space[2],
  },
  text: { flex: 1 },
});
