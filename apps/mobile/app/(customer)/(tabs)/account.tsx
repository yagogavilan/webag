import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { signOut } from '../../../src/api/auth-api';
import { useSession } from '../../../src/api/session';
import { Button } from '../../../src/components/Button';
import { ArrowsClockwise, Bell, Heart, Info, MapPin, User, Question, Receipt, ShieldUser, Document, Tag } from '../../../src/components/icons';
import { ListItem } from '../../../src/components/ListItem';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { EmailVerifyBanner } from '../../../src/features/auth/EmailVerifyBanner';
import { initials } from '../../../src/features/catalog/StoreRow';
import { t } from '../../../src/i18n';
import { theme } from '../../../src/theme';

/** Conta (CC1): cartão da pessoa e a lista em 3 grupos (vida no Webag, avisos e ajuda, privacidade e legal). Visitante só vê o que não pede conta. */
export default function AccountScreen() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const loggedIn = session.status === 'authenticated';

  return (
    <Screen bottomInset={false} scroll testID="account.screen">
      <Text accessibilityRole="header" variant="poster">
        {t('account.title')}
      </Text>

      <EmailVerifyBanner />

      {loggedIn ? (
        <View accessible accessibilityLabel={t('account.initialsLabel', { name: session.user.name, email: session.user.email })} style={styles.profile} testID="home.account">
          <View style={styles.avatar}>
            <Text allowFontScaling={false} style={styles.avatarText} variant="title1">
              {initials(session.user.name)}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text numberOfLines={1} variant="title2">
              {session.user.name}
            </Text>
            <Text color="secondary" numberOfLines={1}>
              {session.user.email}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.visitor} testID="home.visitor">
          <Text style={styles.onInk} variant="title1">
            {t('account.visitorTitle')}
          </Text>
          <Text style={styles.onInkMuted}>{t('account.visitorText')}</Text>
          <Button label={t('login.submit')} onPress={() => router.push('/login')} size="lg" testID="home.login" variant="onInk" />
          <Button label={t('signup.submit')} onPress={() => router.push('/signup')} testID="home.signup" variant="onBrandText" />
        </View>
      )}

      {loggedIn ? (
        <View style={styles.group}>
          <Text color="secondary" variant="captionStrong">
            {t('account.groupLife')}
          </Text>
          <ListItem icon={User} onPress={() => router.push('/profile' as never)} testID="account.item-data" title={t('account.dataItem')} />
          <ListItem icon={MapPin} onPress={() => router.push('/addresses')} testID="account.addresses" title={t('account.addresses')} />
          <ListItem icon={Heart} onPress={() => router.push('/favorites')} testID="account.favorites" title={t('account.favorites')} />
          <ListItem icon={Tag} onPress={() => router.push('/coupons' as never)} testID="account.coupons" title={t('account.couponsItem')} />
          <ListItem icon={ArrowsClockwise} onPress={() => router.push('/exchanges' as never)} testID="account.exchanges" title={t('exchange.listTitle')} />
        </View>
      ) : (
        <View style={styles.group}>
          <ListItem icon={MapPin} onPress={() => router.push('/addresses')} testID="account.addresses" title={t('account.addresses')} />
          <ListItem icon={Heart} onPress={() => router.push('/favorites')} testID="account.favorites" title={t('account.favorites')} />
        </View>
      )}

      <View style={styles.group}>
        <Text color="secondary" variant="captionStrong">
          {t('account.groupHelp')}
        </Text>
        {loggedIn ? <ListItem icon={Bell} onPress={() => router.push('/privacy/notifications' as never)} testID="account.item-notifications" title={t('account.notificationsItem')} /> : null}
        <ListItem icon={Question} onPress={() => router.push('/help' as never)} testID="account.item-help" title={t('account.helpItem')} />
      </View>

      <View style={styles.group}>
        <Text color="secondary" variant="captionStrong">
          {t('account.groupPrivacy')}
        </Text>
        <ListItem icon={ShieldUser} onPress={() => router.push('/privacy' as never)} testID="account.item-privacy" title={t('account.privacyItem')} />
        <ListItem icon={Receipt} onPress={() => router.push('/legal/customer_terms')} testID="account.legal" title={t('account.legal')} />
        <ListItem icon={Document} onPress={() => router.push('/legal/privacy')} testID="account.privacy" title={t('legal.privacy')} />
        <ListItem icon={Info} onPress={() => router.push('/about' as never)} testID="account.item-about" title={t('account.aboutItem')} />
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
  profile: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.card, padding: theme.space[4] },
  avatar: { width: 56, height: 56, borderRadius: theme.radius.lg, backgroundColor: theme.color.brand[500], alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.color.neutral[0] },
  visitor: { gap: theme.space[3], backgroundColor: theme.color.surface.ink, borderRadius: theme.radius.card, padding: theme.space[5] },
  onInk: { color: theme.color.neutral[0] },
  onInkMuted: { color: theme.color.text.onInkMuted },
  group: { gap: theme.space[1], paddingTop: theme.space[3] },
  flex: { flex: 1 },
});
