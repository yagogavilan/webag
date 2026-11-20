import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { IconButton } from '../../components/IconButton';
import { Handbag } from '../../components/icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { theme } from '../../theme';
import { useCartCount } from './hooks';

/**
 * Ícone da sacola com contador, no header do Início e da Loja (testID `home.cart`). Ao entrar item, o contador "pula" (escala
 * 1 para 1,25 e volta, só `transform` no driver nativo); com "reduzir movimento" só troca o número.
 * `onBrand`: sobre a faixa roxa do Início (ícone branco, contador amarelo "sol" com texto escuro, 13:1).
 */
export function CartButton({ testID = 'home.cart', onBrand = false }: { testID?: string; onBrand?: boolean }) {
  const router = useRouter();
  const count = useCartCount();
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current && !reduced) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 120, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      ]).start();
    }
    previous.current = count;
  }, [count, reduced, scale]);

  const label =
    count > 0
      ? t('home.cartOpenCount', { count, noun: count === 1 ? t('cart.itemOne') : t('cart.itemMany') })
      : t('home.cartOpen');
  return (
    <IconButton
      color={onBrand ? theme.color.neutral[0] : theme.color.text.primary}
      corner={
        count > 0 ? (
          <Animated.View style={[styles.counter, onBrand && styles.counterOnBrand, { transform: [{ scale }] }]}>
            <Text color={onBrand ? 'primary' : 'onBrand'} style={styles.counterText} variant="micro">
              {count > 99 ? '99+' : String(count)}
            </Text>
          </Animated.View>
        ) : undefined
      }
      icon={Handbag}
      label={label}
      onPress={() => router.push('/cart')}
      testID={testID}
      weight={onBrand ? 'bold' : 'regular'}
    />
  );
}

const styles = StyleSheet.create({
  counter: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: theme.space[1],
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.action.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterOnBrand: { backgroundColor: theme.color.accent.base },
  counterText: { textAlign: 'center' },
});
