import type { StoreCard } from '@webag/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '../../components/Badge';
import { RemoteImage } from '../../components/RemoteImage';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';

export interface StoreCoverCardProps {
  store: StoreCard;
  categoryName?: string | undefined;
  width: number;
  onPress: () => void;
  testID?: string;
}

/**
 * Card de capa 16:9 para "Lojas novas". [HIPÓTESE] `StoreCard` não traz a capa da loja (só o logo): o app mostra o logo
 * centralizado sobre o fundo neutro até o contrato incluir `cover` (pendencias-contrato-mobile.md).
 */
export function StoreCoverCard({ store, categoryName, width, onPress, testID }: StoreCoverCardProps) {
  return (
    <Pressable
      accessibilityLabel={[store.name, categoryName, t('home.newBadge')].filter(Boolean).join(', ')}
      accessibilityRole="button"
      android_ripple={{ color: theme.color.action.primarySubtlePressed }}
      onPress={onPress}
      style={[styles.card, { width }]}
      testID={testID}
    >
      <View style={[styles.cover, { aspectRatio: 16 / 9 }]}>
        <RemoteImage height={theme.size.thumb} radius={theme.radius.lg} urls={store.logo.urls} width={theme.size.thumb} />
      </View>
      <View style={styles.info}>
        <Text numberOfLines={1} variant="bodyStrong">
          {store.name}
        </Text>
        {categoryName ? (
          <Text color="secondary" numberOfLines={1} variant="caption">
            {categoryName}
          </Text>
        ) : null}
        <Badge label={t('home.newBadge')} tone="brand" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.space[2] },
  cover: { width: '100%', backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.lg, alignItems: 'center', justifyContent: 'center' },
  info: { gap: theme.space[1] },
});
