import type { Category } from '@webag/shared';
import { FlatList, StyleSheet, View } from 'react-native';
import { ProductArt } from '../../art/ProductArt';
import { categoryObject } from '../../components/category-icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { Pressy } from '../../motion';
import { theme } from '../../theme';

export interface CategoryRowProps {
  categories: readonly Category[];
  onOpen: (category: Category) => void;
}

const TILE = 88;
const SHAPES = [{ borderRadius: 24 }, { borderRadius: TILE / 2 }, { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }] as const;

/**
 * Faixa de categorias (direção v3): o objeto do kit sai do quadrado de estúdio (quadrado, círculo, trapézio) e o nome fica
 * sempre visível. A categoria se reconhece pela imagem antes da leitura.
 */
export function CategoryRow({ categories, onOpen }: CategoryRowProps) {
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={categories}
      horizontal
      ItemSeparatorComponent={Gap}
      keyExtractor={(c) => c.id}
      renderItem={({ item, index }) => (
        <Pressy
          accessibilityLabel={t('home.categoryA11y', { name: item.name })}
          accessibilityRole="button"
          feedback="selection"
          onPress={() => onOpen(item)}
          style={styles.cat}
          testID={`home.category-${item.id}`}
        >
          <View style={[styles.tile, SHAPES[index % SHAPES.length]]} />
          <View pointerEvents="none" style={styles.art}>
            <ProductArt color={ARTS[index % ARTS.length] as string} name={categoryObject(item.icon, item.name)} size={84} />
          </View>
          <Text numberOfLines={1} style={styles.name} variant="captionStrong">
            {item.name}
          </Text>
        </Pressy>
      )}
      showsHorizontalScrollIndicator={false}
    />
  );
}

/** Cores base dos objetos na faixa (neutras e de loja: nunca pastel de arco-íris). */
const ARTS = ['#C02EF0', '#4E6E91', '#D99A3D', '#26231F', '#C8945A', '#D2553A'] as const;

const Gap = () => <View style={{ width: theme.space[3] }} />;

const styles = StyleSheet.create({
  list: { paddingHorizontal: theme.layout.screenPaddingX, paddingTop: 20 },
  cat: { width: TILE, alignItems: 'center', gap: theme.space[2], minHeight: theme.size.touchMin },
  tile: { width: TILE, height: TILE, backgroundColor: theme.color.surface.studio },
  art: { position: 'absolute', left: 2, top: -16, width: 84, height: 84 },
  name: { textAlign: 'center', color: theme.color.text.primary },
});
