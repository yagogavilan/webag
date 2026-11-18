import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { IconButton } from '../../components/IconButton';
import { Handbag } from '../../components/icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { useCartCount } from './store';

/** Ícone da sacola com contador, no header do Início e da Loja (testID `home.cart`). */
export function CartButton({ testID = 'home.cart' }: { testID?: string }) {
  const router = useRouter();
  const count = useCartCount();
  const label =
    count > 0
      ? t('home.cartOpenCount', { count, noun: count === 1 ? t('cart.itemOne') : t('cart.itemMany') })
      : t('home.cartOpen');
  return (
    <IconButton
      corner={
        count > 0 ? (
          <View style={styles.counter}>
            <Text color="onBrand" style={styles.counterText} variant="micro">
              {count > 99 ? '99+' : String(count)}
            </Text>
          </View>
        ) : undefined
      }
      icon={Handbag}
      label={label}
      onPress={() => router.push('/cart')}
      testID={testID}
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
  counterText: { textAlign: 'center' },
});
