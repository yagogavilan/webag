import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { theme } from '../theme';
import { CaretLeft } from './icons';
import { Text } from './Text';

export interface HeaderProps {
  title: string;
  /** Sem `onBack` usa o voltar do roteador; `false` esconde o botão (raiz de pilha). */
  onBack?: (() => void) | false;
  right?: ReactNode;
  subtitle?: string;
  /** Título de cartaz (46) sob a barra de voltar: Sacola, Pedidos, Conta. */
  large?: boolean;
}

/** Header de 56 com voltar de 48. Título à esquerda no Android e centralizado no iOS (design-system.md §8). */
export function Header({ title, onBack, right, subtitle, large = false }: HeaderProps) {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const centered = Platform.OS === 'ios';
  return (
    <View>
      <View style={styles.bar}>
        {onBack === false ? (
          <View style={styles.slot} />
        ) : (
          <Pressable
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
            android_ripple={{ color: theme.color.action.primarySubtlePressed, borderless: true }}
            hitSlop={theme.hitSlopFor(theme.size.iconMd)}
            onPress={onBack ?? goBack}
            style={styles.slot}
            testID="header.back"
          >
            <CaretLeft color={theme.color.text.primary} size={theme.size.iconMd} />
          </Pressable>
        )}
        {large ? (
          <View style={styles.flex} />
        ) : (
          <View style={[styles.titleBox, centered && styles.titleCentered]}>
            <Text accessibilityRole="header" numberOfLines={2} variant="title1">
              {title}
            </Text>
            {subtitle ? (
              <Text color="secondary" variant="caption">
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
        <View style={styles.right}>{right}</View>
      </View>
      {large ? (
        <View style={styles.large}>
          <Text accessibilityRole="header" variant="poster">
            {title}
          </Text>
          {subtitle ? (
            <Text color="secondary" variant="caption">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: theme.size.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space[1],
  },
  flex: { flex: 1 },
  large: { paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[2] },
  slot: {
    width: theme.size.touchMin,
    height: theme.size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBox: { flex: 1, paddingVertical: theme.space[2] },
  titleCentered: { alignItems: 'center' },
  right: { minWidth: theme.size.touchMin, alignItems: 'flex-end', justifyContent: 'center' },
});
