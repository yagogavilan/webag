import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSession } from '../../api/session';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';

/** E5a. "Confirme seu e-mail": aparece enquanto o e-mail da conta logada não foi confirmado (WB-007, DEC-014). */
export function EmailVerifyBanner() {
  const router = useRouter();
  const session = useSession();
  if (session.status !== 'authenticated' || session.user.emailVerified) return null;

  return (
    <Banner
      actionLabel={t('email.bannerAction')}
      footer={
        <View style={styles.footer}>
          <Text color="secondary" variant="caption">
            {t('email.sentTo', { email: session.user.email })}
          </Text>
          <Button label={t('email.correct')} onPress={() => router.push({ pathname: '/verify-email', params: { mode: 'correct' } })} testID="auth.email-banner-correct" variant="text" />
        </View>
      }
      onAction={() => router.push('/verify-email')}
      testID="auth.email-banner"
      text={t('email.bannerText')}
      tone="info"
    />
  );
}

const styles = StyleSheet.create({
  footer: { gap: theme.space[1], alignItems: 'flex-start' },
});
