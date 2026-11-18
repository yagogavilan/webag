import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { signOut } from '../../src/api/auth-api';
import { useSession } from '../../src/api/session';
import { Button } from '../../src/components/Button';
import { CaretDown } from '../../src/components/icons';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { EmailVerifyBanner } from '../../src/features/auth/EmailVerifyBanner';
import { addressStore, useCurrentAddress } from '../../src/features/address/store';
import { addressArea, addressLine } from '../../src/features/address/types';
import { t } from '../../src/i18n';
import { theme } from '../../src/theme';

/**
 * Início do cliente (esqueleto até a onda 3B). A tela real segue a spec do product-designer.
 * Hoje concentra o acesso à conta (entrar, criar conta, sair) e o aviso de e-mail não confirmado (E5a).
 */
export default function CustomerHome() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const address = useCurrentAddress();

  return (
    <Screen scroll>
      {address ? (
        <Pressable
          accessibilityHint={t('home.pickAddress')}
          accessibilityLabel={`${t('home.deliverTo')} ${addressLine(address)}, ${addressArea(address)}`}
          accessibilityRole="button"
          onPress={() => router.push('/addresses')}
          style={styles.address}
          testID="home.address"
        >
          <View style={styles.addressTexts}>
            <Text color="secondary" variant="caption">
              {t('home.deliverTo')}
            </Text>
            <Text numberOfLines={1} variant="bodyStrong">
              {addressLine(address)}
            </Text>
          </View>
          <CaretDown color={theme.color.text.primary} size={theme.size.iconMd} />
        </Pressable>
      ) : null}

      <View style={styles.brandBox}>
        <Text accessibilityRole="header" style={styles.brand} variant="display">
          {t('common.appName')}
        </Text>
        <Text color="secondary">Lojas da sua região</Text>
      </View>

      <EmailVerifyBanner />

      {session.status === 'authenticated' ? (
        <View style={styles.account} testID="home.account">
          <Text variant="bodyStrong">{t('home.greeting', { name: session.user.name.split(' ')[0] ?? '' })}</Text>
          <Button
            label={t('home.signOut')}
            onPress={() => {
              // endereço é dado pessoal: não fica no aparelho depois de sair
              void signOut()
                .then(() => addressStore.clearAll())
                .then(() => toast.show(t('home.signedOut')));
            }}
            testID="home.sign-out"
            variant="secondary"
          />
        </View>
      ) : (
        <View style={styles.account} testID="home.visitor">
          <Text color="secondary">{t('home.visitorText')}</Text>
          <Button label={t('login.submit')} onPress={() => router.push('/login')} testID="home.login" />
          <Button label={t('signup.submit')} onPress={() => router.push('/signup')} testID="home.signup" variant="secondary" />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  address: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], minHeight: theme.size.touchMin },
  addressTexts: { flex: 1 },
  brandBox: { gap: theme.space[2], paddingTop: theme.space[10] },
  brand: { color: theme.color.text.brand },
  account: { gap: theme.space[3] },
});
