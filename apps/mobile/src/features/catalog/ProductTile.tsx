import type { BrowseProductItem, ProductCard } from '@webag/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge } from '../../components/Badge';
import { RemoteImage } from '../../components/RemoteImage';
import { Text } from '../../components/Text';
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
  testID?: string;
}

/** Card de produto em grade: imagem 1:1, preço, nome em até 2 linhas, loja em `caption` quando há (busca e ofertas). */
export function ProductTile({ product, width, onPress, testID }: ProductTileProps) {
  const muted = product.state === 'soldOut' || product.state === 'unavailable';
  return (
    <Pressable
      accessibilityLabel={a11yLabel(product)}
      accessibilityRole="button"
      android_ripple={{ color: theme.color.action.primarySubtlePressed }}
      onPress={onPress}
      style={[styles.tile, { width }]}
      testID={testID}
    >
      <RemoteImage aspectRatio={1} urls={product.urls} width={width} />
      <View style={styles.info}>
        {product.priceCents !== null ? (
          <Price cents={product.priceCents} discountPercent={product.discountPercent ?? null} muted={muted} originalCents={product.originalCents ?? null} />
        ) : null}
        <Text numberOfLines={2}>{product.name}</Text>
        {product.storeName ? (
          <Text color="secondary" numberOfLines={1} variant="caption">
            {product.storeName}
          </Text>
        ) : null}
        {product.state === 'soldOut' ? <Badge label={t('catalog.soldOut')} /> : null}
        {product.state === 'unavailable' ? <Badge label={t('catalog.unavailable')} /> : null}
        {product.state === 'closed' ? <Badge label={t('results.closedBadge')} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { gap: theme.space[2] },
  info: { gap: theme.space[1] },
});
