import { View } from 'react-native';
import type { ComponentType, ReactElement, ReactNode } from 'react';

/**
 * FlashList nos testes: renderiza TODOS os itens (a virtualização depende de medida de layout nativa, que o Jest não tem).
 * Comportamento de lista (estados, toques, paginação por `onEndReached`) é o que se testa, não a reciclagem de células.
 */
interface Props<T> {
  data?: readonly T[] | null;
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
  keyExtractor?: (item: T, index: number) => string;
  ListHeaderComponent?: ReactNode | ComponentType;
  ListFooterComponent?: ReactNode | ComponentType;
  ListEmptyComponent?: ReactNode | ComponentType;
  testID?: string;
  numColumns?: number;
  onEndReached?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const slot = (c: ReactNode | ComponentType | undefined): ReactNode => {
  if (!c) return null;
  if (typeof c === 'function') {
    const Comp = c as ComponentType;
    return <Comp />;
  }
  return c as ReactNode;
};

export function FlashList<T>({ data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent, ListEmptyComponent, testID, numColumns = 1, onEndReached }: Props<T>) {
  const items = data ?? [];
  const cell = (item: T, index: number) => <View key={keyExtractor ? keyExtractor(item, index) : String(index)} style={numColumns > 1 ? { width: `${100 / numColumns}%` } : undefined}>{renderItem({ item, index })}</View>;
  return (
    // `onEndReached` fica no elemento para o teste disparar a paginação com fireEvent(lista, 'endReached')
    <View {...({ onEndReached } as object)} testID={testID}>
      {slot(ListHeaderComponent)}
      {items.length === 0 ? slot(ListEmptyComponent) : <View style={numColumns > 1 ? { flexDirection: 'row', flexWrap: 'wrap' } : undefined}>{items.map(cell)}</View>}
      {slot(ListFooterComponent)}
    </View>
  );
}
