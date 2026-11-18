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

const TILE = 64;

/** Categorias: tile sem caixa com círculo de 64 e o nome embaixo, na ordem do admin (onda-3 D5). */
export function CategoryRow({ categories, onOpen }: CategoryRowProps) {
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={categories}
      horizontal
      ItemSeparatorComponent={Gap}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => {
        const Icon = categoryIcon(item.icon);
        return (
          <Pressable
            accessibilityLabel={t('home.categoryA11y', { name: item.name })}
            accessibilityRole="button"
            onPress={() => onOpen(item)}
            style={styles.tile}
            testID={`home.category-${item.id}`}
          >
            <View style={styles.circle}>
              <Icon color={theme.color.text.brand} size={theme.size.iconLg} weight="duotone" />
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
  tile: { width: TILE + theme.space[2], alignItems: 'center', gap: theme.space[1], minHeight: theme.size.touchMin },
  circle: { width: TILE, height: TILE, borderRadius: theme.radius.full, backgroundColor: theme.color.surface.brandSubtle, alignItems: 'center', justifyContent: 'center' },
  name: { textAlign: 'center' },
});
