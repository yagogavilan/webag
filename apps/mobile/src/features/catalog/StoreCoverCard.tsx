import type { StoreCard } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { ProductArt, objectFor } from '../../art/ProductArt';
import { RemoteImage } from '../../components/RemoteImage';
import { Sticker } from '../../components/Sticker';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { Pressy } from '../../motion';
import { theme } from '../../theme';
import { coverColor, initials } from './StoreRow';

export interface StoreCoverCardProps {
  store: StoreCard;
  categoryName?: string | undefined;
  width: number;
  onPress: () => void;
  testID?: string;
}

/**
 * Card de capa para "Lojas novas". [HIPÓTESE] `StoreCard` não traz a capa da loja (só o logo): a capa é a cor da loja com a arte da
 * categoria; o logo vira adesivo inclinado (pendencias-contrato-mobile.md pede `cover`).
 */
export function StoreCoverCard({ store, categoryName, width, onPress, testID }: StoreCoverCardProps) {
  const color = coverColor(store.id);
  return (
    <Pressy
      accessibilityLabel={[store.name, categoryName, t('home.newBadge')].filter(Boolean).join(', ')}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, { width }]}
      testID={testID}
    >
      <View style={[styles.cover, { backgroundColor: color }]}>
        <View pointerEvents="none" style={styles.art}>
          <ProductArt color="#F2EFE9" ground="rgba(0,0,0,0.35)" name={objectFor(`${categoryName ?? ''} ${store.name}`)} size={120} />
        </View>
        <Sticker label={t('home.newBadge')} rotate={-6} style={styles.badge} />
        {store.logo.urls && Object.keys(store.logo.urls).length > 0 ? (
          <RemoteImage height={theme.size.avatarMd} radius={theme.radius.lg} style={styles.logo} urls={store.logo.urls} width={theme.size.avatarMd} />
        ) : (
          <View style={styles.logo}>
            <Text style={{ color }} variant="title2">
              {initials(store.name)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text numberOfLines={1} variant="title2">
          {store.name}
        </Text>
        {categoryName ? (
          <Text color="secondary" numberOfLines={1} variant="caption">
            {categoryName}
          </Text>
        ) : null}
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.space[2], minHeight: theme.size.touchMin },
  cover: { height: 120, borderRadius: theme.radius.card, overflow: 'hidden' },
  art: { position: 'absolute', right: 6, top: 4 },
  badge: { position: 'absolute', left: 12, top: 14 },
  logo: { position: 'absolute', left: 12, bottom: 12, width: 56, height: 56, borderRadius: 16, backgroundColor: theme.color.neutral[0], alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] },
  info: { gap: theme.space[1] },
});
