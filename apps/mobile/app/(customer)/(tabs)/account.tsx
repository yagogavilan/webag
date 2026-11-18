import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { signOut } from '../../../src/api/auth-api';
import { useSession } from '../../../src/api/session';
import { Button } from '../../../src/components/Button';
import { Heart, MapPin, Question, Receipt } from '../../../src/components/icons';
import { ListItem } from '../../../src/components/ListItem';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { EmailVerifyBanner } from '../../../src/features/auth/EmailVerifyBanner';
import { t } from '../../../src/i18n';
import { theme } from '../../../src/theme';

/** Conta (WB-032, versão enxuta): acesso, endereços, favoritos e termos. Dados pessoais e pedidos entram nas ondas seguintes. */
export default function AccountScreen() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const loggedIn = session.status === 'authenticated';

  return (
    <Screen bottomInset={false} scroll testID="account.screen">
      <Text accessibilityRole="header" variant="title1">
        {t('account.title')}
      </Text>

      <EmailVerifyBanner />

      {loggedIn ? (
        <View style={styles.hello} testID="home.account">
          <Text variant="title2">{t('home.greeting', { name: session.user.name.split(' ')[0] ?? '' })}</Text>
          <Text color="secondary">{session.user.email}</Text>
        </View>
      ) : (
        <View style={styles.hello} testID="home.visitor">
          <Text variant="title2">{t('account.visitorTitle')}</Text>
          <Text color="secondary">{t('account.visitorText')}</Text>
          <Button label={t('login.submit')} onPress={() => router.push('/login')} size="lg" testID="home.login" />
          <Button label={t('signup.submit')} onPress={() => router.push('/signup')} testID="home.signup" variant="secondary" />
        </View>
      )}

      <View>
        <ListItem icon={MapPin} onPress={() => router.push('/addresses')} testID="account.addresses" title={t('account.addresses')} />
        <ListItem icon={Heart} onPress={() => router.push('/favorites')} testID="account.favorites" title={t('account.favorites')} />
        <ListItem icon={Receipt} onPress={() => router.push('/legal/customer_terms')} testID="account.legal" title={t('account.legal')} />
        <ListItem icon={Question} onPress={() => router.push('/legal/privacy')} testID="account.privacy" title={t('legal.privacy')} />
      </View>

      {loggedIn ? (
        <Button
          label={t('account.signOut')}
          onPress={() => {
            // a limpeza de endereços e do cache pessoal roda no fim da sessão (SEC-122)
            void signOut().then(() => toast.show(t('home.signedOut')));
          }}
          testID="home.sign-out"
          variant="secondary"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: { gap: theme.space[2], paddingVertical: theme.space[2] },
});
