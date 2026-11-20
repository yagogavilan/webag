import { StyleSheet, View } from 'react-native';
import { Money } from '../../components/Money';
import { RemoteImage } from '../../components/RemoteImage';
import { OfferSeal } from '../../components/Sticker';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { Pressy } from '../../motion';
import { theme } from '../../theme';
import { productFallback } from './image';
import type { ProductTileData } from './ProductTile';

/** Cartão de oferta sobre noite: foto em estúdio escuro, selo lima só com preço antigo visível ao lado do preço. */
function OfferCard({ product, tall, onPress, testID }: { product: ProductTileData; tall?: boolean; onPress: () => void; testID?: string }) {
  const hasPromo = product.originalCents != null && product.priceCents !== null && product.originalCents > product.priceCents;
  const a11y = [product.name, product.priceCents !== null ? formatMoney(product.priceCents) : null, hasPromo && product.originalCents != null ? `de ${formatMoney(product.originalCents)}` : null].filter(Boolean).join(', ');
  return (
    <Pressy accessibilityLabel={a11y} accessibilityRole="button" onPress={onPress} style={[styles.offer, tall && styles.tall]} testID={testID}>
      <View style={[styles.photo, tall && styles.photoTall]}>
        <RemoteImage fallback={productFallback(product.name, true)} height={tall ? 232 : 100} radius={theme.radius.lg} urls={product.urls} width={156} style={styles.img} />
        {hasPromo && product.discountPercent ? <OfferSeal label={t('catalog.off', { pct: product.discountPercent })} style={styles.seal} /> : null}
      </View>
      <Text numberOfLines={2} style={styles.name} variant="captionStrong">
        {product.name}
      </Text>
      {product.priceCents !== null ? (
        <View style={styles.prices}>
          <Money color={theme.color.neutral[0]} cents={product.priceCents} size="sm" />
          {hasPromo && product.originalCents != null ? (
            <Text style={styles.old} variant="caption">
              {formatMoney(product.originalCents)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressy>
  );
}

/** "Baixou o preço": 1 grande + 2 pequenos (bento) sobre a faixa noite. Mais de 3 ofertas continuam em carrossel horizontal. */
export function OfferBento({ products, onOpen }: { products: ProductTileData[]; onOpen: (id: string) => void }) {
  const [big, ...rest] = products;
  if (!big) return null;
  return (
    <View style={styles.grid}>
      <OfferCard onPress={() => onOpen(big.id)} product={big} tall testID={`home.offer-${big.id}`} />
      <View style={styles.col}>
        {rest.slice(0, 2).map((p) => (
          <OfferCard key={p.id} onPress={() => onOpen(p.id)} product={p} testID={`home.offer-${p.id}`} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: theme.space[3], paddingHorizontal: theme.layout.screenPaddingX },
  col: { flex: 1, gap: theme.space[3] },
  offer: { flex: 1, gap: 6, minHeight: theme.size.touchMin },
  tall: { flex: 1 },
  photo: { height: 100, borderRadius: theme.radius.lg, backgroundColor: theme.color.neutral[800], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoTall: { height: 232 },
  img: { position: 'absolute', width: '100%' },
  seal: { position: 'absolute', left: 10, top: 10 },
  name: { color: theme.color.neutral[0] },
  prices: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  old: { color: theme.color.text.onInkMuted, textDecorationLine: 'line-through' },
});
