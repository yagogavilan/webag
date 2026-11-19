import type { StoreCard } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { ProductArt, objectFor } from '../../art/ProductArt';
import { Clock, Star } from '../../components/icons';
import { RemoteImage } from '../../components/RemoteImage';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { Pressy } from '../../motion';
import { theme } from '../../theme';
import { closedLabel, formatDistance, formatFee, formatRating, ratingA11y } from './format';
import { deliveryUnavailable } from './unavailable';
import { deliveryEta } from './eta';

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

/** Cor da capa por loja (estável pelo id): só tons sólidos e escuros da paleta, texto branco por cima passa AA. */
const COVERS = ['#2F4A6B', '#8A3B22', '#26231F', '#4A6630', '#6A1580'] as const;
export function coverColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length] as string;
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}

function metaLine(store: StoreCard, approximate: boolean, pickup: boolean): string {
  const distance = formatDistance(store.distanceM);
  if (pickup) return `${distance} · ${t('catalog.pickupOnly')}`;
  const fee = formatFee(store.delivery.feeCents, { approximate });
  return [fee ? `${t('catalog.delivery')} ${fee}` : null, distance].filter(Boolean).join(' · ');
}

/**
 * Cartão de loja v3 (direção v3): capa na cor da loja com a arte da categoria saindo por cima, faixa de entrega no chip
 * (DEC-053: faixa real da loja para o endereço, nunca número único), logo-adesivo inclinado e meta em uma linha.
 * Loja fechada continua tocável (DEC-022); loja fora do alcance de 120 min mostra "Fora da área".
 */
export function StoreRow({ store, categoryName, approximate = false, pickup = false, onPress, testID }: StoreRowProps) {
  const meta = metaLine(store, approximate, pickup);
  const range = pickup ? null : deliveryEta(store.delivery);
  const outOfArea = !pickup && range === null;
  // Entregas fechadas por horário da logística (BUG-016): a loja segue listada e a entrega volta a uma hora certa
  // A causa vem de `unavailableReason` (WB-260); sem ela, "Entrega indisponível", nunca "fora da área" por omissão
  const unavailable = outOfArea ? deliveryUnavailable(store.delivery) : null;
  const backLabel = unavailable?.back ? unavailable.chip : null;
  const eta = range ? `Chega entre ${range.start} e ${range.end}` : null;
  const status = store.open ? t('catalog.open') : closedLabel(store.opensAt);
  const label = [
    store.name,
    categoryName,
    ratingA11y(store.rating),
    unavailable ? unavailable.chip : eta,
    meta,
    status,
    store.delivery.freeShipping && !pickup ? t('catalog.freeShipping') : null,
    store.acceptsExchange ? t('catalog.acceptsExchange') : null,
  ]
    .filter(Boolean)
    .join(', ');
  const color = coverColor(store.id);
  const art = objectFor(`${categoryName ?? ''} ${store.name}`);
  return (
    <Pressy accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.card} testID={testID}>
      <View style={[styles.cover, { backgroundColor: color }]}>
        <View pointerEvents="none" style={styles.art}>
          <ProductArt color="#F2EFE9" ground="rgba(0,0,0,0.35)" name={art} size={150} />
        </View>
        <View style={styles.chip}>
          {outOfArea ? (
            <Text allowFontScaling={false} style={styles.chipText} testID={backLabel ? 'store-card.delivery-back' : undefined} variant="captionStrong">
              {unavailable?.chip}
            </Text>
          ) : range ? (
            <>
              <Clock color={theme.color.action.primary} size={16} weight="duotone" />
              <Text allowFontScaling={false} style={styles.chipText} variant="captionStrong">
                {`${range.start} – ${range.end}`}
              </Text>
            </>
          ) : (
            <Text allowFontScaling={false} style={styles.chipText} variant="captionStrong">
              {t('catalog.pickupOnly')}
            </Text>
          )}
        </View>
        <View style={styles.logoShadow} />
        <View style={styles.logo}>
          {store.logo.urls && Object.keys(store.logo.urls).length > 0 ? (
            <RemoteImage alt={t('catalog.logoAlt', { name: store.name })} height={52} radius={theme.radius.lg - 2} urls={store.logo.urls} width={52} />
          ) : (
            <Text allowFontScaling={false} style={[styles.initials, { color }]} variant="title2">
              {initials(store.name)}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.info}>
        <Text numberOfLines={1} variant="title2">
          {store.name}
        </Text>
        <View style={styles.ratingRow}>
          <Star color={theme.color.rating.star} size={16} weight="fill" />
          <Text color="secondary" variant="caption">
            {formatRating(store.rating)}
            {categoryName ? ` · ${categoryName}` : ''}
          </Text>
        </View>
        <Text color="secondary" variant="caption">
          {meta}
        </Text>
        {!store.open ? (
          <Text color="warning" variant="captionStrong">
            {closedLabel(store.opensAt)}
          </Text>
        ) : null}
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.space[3], paddingBottom: theme.space[5], minHeight: theme.size.touchMin },
  cover: { height: 148, borderRadius: theme.radius.card, overflow: 'visible' },
  art: { position: 'absolute', right: 8, top: -22, width: 150, height: 150 },
  chip: { position: 'absolute', left: 12, top: 12, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.color.neutral[0], borderRadius: theme.radius.md, paddingHorizontal: 10 },
  chipText: { color: theme.color.neutral[900] },
  logoShadow: { position: 'absolute', left: 16 + theme.hardShadow.offset, bottom: -22 + theme.hardShadow.offset, width: 56, height: 56, borderRadius: 16, backgroundColor: theme.color.surface.ink, transform: [{ rotate: '-6deg' }] },
  logo: { position: 'absolute', left: 16, bottom: -22, width: 56, height: 56, borderRadius: 16, backgroundColor: theme.color.neutral[0], alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transform: [{ rotate: '-6deg' }] },
  initials: { letterSpacing: -0.5 },
  info: { paddingTop: 22, gap: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1] },
});
