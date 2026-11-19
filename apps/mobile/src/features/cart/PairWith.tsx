import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { fromBrowseItem, ProductTile } from '../catalog/ProductTile';
import { useStoreProductsQuery } from '../catalog/queries';

/** "Peça também": itens da mesma loja que ainda não estão na sacola. Toca e abre a ficha (item com variação exige escolha). Some sem itens. */
export function PairWith({ storeId, excludeProductIds, onOpen }: { storeId: string; excludeProductIds: readonly string[]; onOpen: (productId: string) => void }) {
  const query = useStoreProductsQuery(storeId, null);
  const items = (query.data?.pages[0]?.data ?? []).filter((p) => p.available && !excludeProductIds.includes(p.id)).slice(0, 6);
  if (items.length === 0) return null;
  return (
    <View style={styles.wrap} testID="cart.pair-with">
      <Text accessibilityRole="header" variant="title1">
        {t('cart.pairWith')}
      </Text>
      <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {items.map((p) => (
          <ProductTile key={p.id} onPress={() => onOpen(p.id)} product={fromBrowseItem(p)} testID={`cart.pair-${p.id}`} width={128} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space[3], paddingTop: theme.space[4] },
  scroll: { marginHorizontal: -theme.layout.screenPaddingX },
  row: { paddingHorizontal: theme.layout.screenPaddingX, gap: theme.space[3] },
});
