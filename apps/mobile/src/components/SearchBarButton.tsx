import { Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { MagnifyingGlass } from './icons';
import { Text } from './Text';

export interface SearchBarButtonProps {
  placeholder: string;
  /** Texto atual (resultados mostram o termo; tocar volta à busca). */
  value?: string;
  onPress: () => void;
  testID?: string;
}

/** SearchBar em forma de botão (Início e Resultados): pílula de 48 que abre a tela de busca com o teclado aberto. */
export function SearchBarButton({ placeholder, value, onPress, testID }: SearchBarButtonProps) {
  return (
    <Pressable
      accessibilityLabel={value ? `${placeholder}: ${value}` : placeholder}
      accessibilityRole="search"
      onPress={onPress}
      style={styles.bar}
      testID={testID}
    >
      <MagnifyingGlass color={theme.color.text.secondary} size={theme.size.iconMd} />
      <Text color={value ? 'primary' : 'secondary'} numberOfLines={1} style={styles.text}>
        {value || placeholder}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: theme.size.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    paddingHorizontal: theme.space[4],
    backgroundColor: theme.color.surface.sunken,
    borderRadius: theme.radius.full,
  },
  text: { flex: 1 },
});
