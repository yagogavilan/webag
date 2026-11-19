import type { StoreCard } from '@webag/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '../../components/Badge';
import { ArrowsClockwise, Clock, Star, Truck } from '../../components/icons';
import { RemoteImage } from '../../components/RemoteImage';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { closedLabel, formatDistance, formatEta, formatFee, formatRating, ratingA11y } from './format';

export interface StoreRowProps {
  store: StoreCard;
  /** Nome da categoria principal (a API manda só o id). */
  categoryName?: string | undefined;
  /** Endereço só aproximado (cidade/GPS): o frete vira "a partir de". */
  approximate?: boolean;
  /** Modo retirada: destaca a distância e tira a taxa. */
  pickup?: boolean;
  onPress: () => void;
  testID?: string;
}

function metaLine(store: StoreCard, approximate: boolean, pickup: boolean): string {
  const distance = formatDistance(store.distanceM);
  if (pickup) return `${distance} · ${t('catalog.pickupOnly')}`;
  const fee = formatFee(store.delivery.feeCents, { approximate });
  return [formatEta(store.delivery.etaMinMinutes, store.delivery.etaMaxMinutes), fee, distance].filter(Boolean).join(' · ');
}

/** Card de loja em Linha (§4): logo 56 + 2 linhas, selos. Loja fechada continua tocável e navegável (DEC-022). */
export function StoreRow({ store, categoryName, approximate = false, pickup = false, onPress, testID }: StoreRowProps) {
  const meta = metaLine(store, approximate, pickup);
  const status = store.open ? t('catalog.open') : closedLabel(store.opensAt);
  const label = [
    store.name,
    categoryName,
    ratingA11y(store.rating),
    meta,
    status,
    store.delivery.freeShipping && !pickup ? t('catalog.freeShipping') : null,
    store.acceptsExchange ? t('catalog.acceptsExchange') : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      android_ripple={{ color: theme.color.action.primarySubtlePressed }}
      onPress={onPress}
      style={styles.row}
      testID={testID}
    >
      <RemoteImage alt={t('catalog.logoAlt', { name: store.name })} height={theme.size.avatarMd} radius={theme.radius.lg} urls={store.logo.urls} width={theme.size.avatarMd} />
      <View style={styles.texts}>
        <Text numberOfLines={1} variant="bodyStrong">
          {store.name}
        </Text>
        {categoryName ? (
          <Text color="secondary" numberOfLines={1} variant="caption">
            {categoryName}
          </Text>
        ) : null}
        <View style={styles.ratingRow}>
          <Star color={theme.color.rating.star} size={16} weight="fill" />
          <Text variant="caption">{formatRating(store.rating)}</Text>
        </View>
        <Text color="secondary" variant="caption">
          {meta}
        </Text>
        <View style={styles.badges}>
          {store.open ? <Badge icon={Clock} label={t('catalog.open')} tone="success" /> : <Badge icon={Clock} label={closedLabel(store.opensAt)} />}
          {store.delivery.freeShipping && !pickup ? <Badge icon={Truck} label={t('catalog.freeShipping')} tone="success" /> : null}
          {store.acceptsExchange ? <Badge icon={ArrowsClockwise} label={t('catalog.acceptsExchange')} tone="brand" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.space[3],
    paddingVertical: theme.space[3],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.color.border.subtle,
    minHeight: theme.size.touchMin,
  },
  texts: { flex: 1, gap: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[1], paddingTop: theme.space[1] },
});
