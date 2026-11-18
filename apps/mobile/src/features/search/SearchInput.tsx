import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { MagnifyingGlass, X } from '../../components/icons';
import { t } from '../../i18n';
import { theme } from '../../theme';

export interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
}

/** Campo de busca (48, pílula): teclado com a tecla "Buscar", X de 48 para limpar. Fonte dinâmica limitada a 1,5. */
export function SearchInput({ value, onChangeText, onSubmit, autoFocus }: SearchInputProps) {
  const input = useRef<TextInputInstance>(null);
  return (
    <View style={styles.bar}>
      <MagnifyingGlass color={theme.color.text.secondary} size={theme.size.iconMd} />
      <TextInput
        accessibilityLabel={t('search.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        enterKeyHint="search"
        maxFontSizeMultiplier={theme.maxFont.default}
        maxLength={80}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={t('search.placeholder')}
        placeholderTextColor={theme.color.text.secondary}
        ref={input}
        returnKeyType="search"
        style={styles.input}
        testID="search.input"
        value={value}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel={t('search.clear')}
          accessibilityRole="button"
          hitSlop={theme.hitSlopFor(theme.size.iconMd)}
          onPress={() => {
            onChangeText('');
            input.current?.focus();
          }}
          style={styles.clear}
          testID="search.clear"
        >
          <X color={theme.color.text.secondary} size={theme.size.iconMd} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flex: 1,
    minHeight: theme.size.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    paddingLeft: theme.space[4],
    backgroundColor: theme.color.surface.sunken,
    borderRadius: theme.radius.full,
  },
  input: { flex: 1, minHeight: theme.size.controlMd, ...theme.text.body, color: theme.color.text.primary, paddingVertical: 0 },
  clear: { width: theme.size.touchMin, height: theme.size.touchMin, alignItems: 'center', justifyContent: 'center' },
});
