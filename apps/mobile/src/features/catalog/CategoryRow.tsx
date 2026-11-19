import type { Category } from '@webag/shared';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { categoryIcon } from '../../components/category-icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';

export interface CategoryRowProps {
  categories: readonly Category[];
  onOpen: (category: Category) => void;
}

const TILE = 80;
const SLOTS = [1, 2, 3, 4, 5, 6] as const;

/** Categorias (direção v2): tile pastel de 80, raio 16, ícone duotone em tinta escura e rótulo sempre visível; cor por posição (6 tons). */
export function CategoryRow({ categories, onOpen }: CategoryRowProps) {
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={categories}
      horizontal
      ItemSeparatorComponent={Gap}
      keyExtractor={(c) => c.id}
      renderItem={({ item, index }) => {
        const slot = SLOTS[index % SLOTS.length] ?? 1;
        const Icon = categoryIcon(item.icon);
        return (
          <Pressable
            accessibilityLabel={t('home.categoryA11y', { name: item.name })}
            accessibilityRole="button"
            onPress={() => onOpen(item)}
            style={styles.tile}
            testID={`home.category-${item.id}`}
          >
            <View style={[styles.circle, { backgroundColor: theme.color.tile[slot] }]}>
              <Icon color={theme.color.tileInk[slot]} size={theme.size.iconLg} weight="duotone" />
            </View>
            <Text numberOfLines={1} style={styles.name} variant="caption">
              {item.name}
            </Text>
          </Pressable>
        );
      }}
      showsHorizontalScrollIndicator={false}
    />
  );
}

const Gap = () => <View style={{ width: theme.space[3] }} />;

const styles = StyleSheet.create({
  list: { paddingHorizontal: theme.layout.screenPaddingX },
  tile: { width: TILE, alignItems: 'center', gap: theme.space[1], minHeight: theme.size.touchMin },
  circle: { width: TILE, height: TILE, borderRadius: theme.radius.lg, alignItems: 'center', justifyContent: 'center' },
  name: { textAlign: 'center' },
});
