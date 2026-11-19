import type { BrowseProductItem, ProductCard } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { Badge } from '../../components/Badge';
import { RemoteImage } from '../../components/RemoteImage';
import { OfferSeal } from '../../components/Sticker';
import { Text } from '../../components/Text';
import { Pressy } from '../../motion';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';
import { closedLabel } from './format';
import { Price } from './Price';

/** Dado mínimo para desenhar um produto, venha ele da busca, da home, da loja ou dos favoritos. */
export interface ProductTileData {
  id: string;
  name: string;
  urls: Record<string, string> | undefined;
  priceCents: number | null;
  originalCents?: number | null;
  discountPercent?: number | null;
  storeName?: string;
  /** Selo: esgotado, indisponível ou loja fechada (o produto abre normalmente, só não vai ao pedido). */
  state?: 'soldOut' | 'unavailable' | 'closed' | null;
  closedText?: string;
}

export function fromProductCard(p: ProductCard): ProductTileData {
  return {
    id: p.id,
    name: p.name,
    urls: p.image.urls,
    priceCents: p.price.amount,
    originalCents: p.originalPrice?.amount ?? null,
    discountPercent: p.discountPercent,
    storeName: p.store.name,
    state: p.store.open ? null : 'closed',
    closedText: closedLabel(p.store.opensAt),
  };
}

export function fromBrowseItem(p: BrowseProductItem): ProductTileData {
  return {
    id: p.id,
    name: p.name,
    urls: p.image.urls,
    priceCents: p.price.amount,
    originalCents: p.originalPrice?.amount ?? null,
    discountPercent: p.discountPercent,
    state: p.available ? null : 'soldOut',
  };
}

function a11yLabel(p: ProductTileData): string {
  const parts = [p.name];
  if (p.priceCents !== null) parts.push(formatMoney(p.priceCents));
  if (p.storeName) parts.push(`${t('catalog.storeOf')} ${p.storeName}`);
  if (p.state === 'soldOut') parts.push(t('catalog.soldOut'));
  if (p.state === 'unavailable') parts.push(t('catalog.unavailable'));
  if (p.state === 'closed') parts.push(p.closedText ?? t('catalog.closed'));
  return parts.join(', ');
}

export interface ProductTileProps {
  product: ProductTileData;
  /** Largura em dp (grade: a coluna; carrossel: fixa). */
  width: number;
  onPress: () => void;
  /** `ink`: sobre a faixa noite (ofertas). */
  tone?: 'light' | 'ink';
  testID?: string;
}

/** Card de produto v3: foto 4:5 em estúdio (raio 22, sem sombra), selo lima sobre a foto, preço de cartaz colado ao nome, loja em `caption`. */
export function ProductTile({ product, width, onPress, tone = 'light', testID }: ProductTileProps) {
  const muted = product.state === 'soldOut' || product.state === 'unavailable';
  const ink = tone === 'ink';
  const hasPromo = product.originalCents != null && product.priceCents !== null && product.originalCents > product.priceCents;
  return (
    <Pressy accessibilityLabel={a11yLabel(product)} accessibilityRole="button" onPress={onPress} style={[styles.tile, { width }]} testID={testID}>
      <View style={styles.photoBox}>
        <RemoteImage aspectRatio={4 / 5} radius={theme.radius.card - 2} style={ink ? styles.photoInk : undefined} urls={product.urls} width={width} />
        {hasPromo && product.discountPercent ? <OfferSeal label={t('catalog.off', { pct: product.discountPercent })} style={styles.seal} /> : null}
      </View>
      <View style={styles.info}>
        {product.priceCents !== null ? (
          <Price cents={product.priceCents} discountPercent={product.discountPercent ?? null} muted={muted} onInk={ink} originalCents={product.originalCents ?? null} />
        ) : null}
        <Text color={ink ? 'inverse' : 'primary'} numberOfLines={2} variant="captionStrong">
          {product.name}
        </Text>
        {product.storeName ? (
          <Text color={ink ? 'inverse' : 'secondary'} numberOfLines={1} variant="caption">
            {product.storeName}
          </Text>
        ) : null}
        {product.state === 'soldOut' ? <Badge label={t('catalog.soldOut')} /> : null}
        {product.state === 'unavailable' ? <Badge label={t('catalog.unavailable')} /> : null}
        {product.state === 'closed' ? <Badge label={t('results.closedBadge')} /> : null}
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  tile: { gap: theme.space[2], minHeight: theme.size.touchMin },
  photoBox: { borderRadius: theme.radius.card - 2, overflow: 'hidden' },
  photoInk: { backgroundColor: theme.color.neutral[800] },
  seal: { position: 'absolute', left: 8, top: 8 },
  info: { gap: theme.space[1] },
});
