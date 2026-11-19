import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Linking, StyleSheet, View } from 'react-native';
import { fetchHelp } from '../../src/api/privacy-api';
import { useSession } from '../../src/api/session';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Bell, Document, Download, ShieldUser, Trash, User } from '../../src/components/icons';
import { ListItem } from '../../src/components/ListItem';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { t } from '../../src/i18n';
import { theme } from '../../src/theme';

/** CC7. Privacidade e dados: quem responde pelos dados (encarregado) e o caminho de cada direito do titular. */
export default function PrivacyScreen() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const loggedIn = session.status === 'authenticated';
  const help = useQuery({ queryKey: ['help', 'customer'], queryFn: ({ signal }) => fetchHelp(signal), staleTime: 5 * 60_000 });
  const dpo = help.data?.privacy;

  return (
    <Screen header={<Header title={t('privacy.title')} />} testID="account.privacy-screen">
      <Text accessibilityRole="header" variant="poster">
        {t('privacy.title')}
      </Text>
      <View style={styles.card} testID="account.privacy-dpo">
        <Text variant="title1">{t('privacy.dpoTitle')}</Text>
        {help.isLoading ? <Skeleton height={20} width="60%" /> : null}
        {dpo?.officerName || dpo?.officerEmail ? (
          <>
            {dpo.officerName ? <Text variant="bodyStrong">{dpo.officerName}</Text> : null}
            {dpo.officerEmail ? <Text>{dpo.officerEmail}</Text> : null}
            {dpo.officerEmail ? (
              <View style={styles.row}>
                <Button
                  label={t('privacy.dpoCopy')}
                  onPress={() => {
                    void Clipboard.setStringAsync(dpo.officerEmail ?? '');
                    toast.show(t('privacy.dpoCopied'));
                  }}
                  testID="account.privacy-dpo-copy"
                  variant="secondary"
                />
                <Button label={t('privacy.dpoWrite')} onPress={() => void Linking.openURL(`mailto:${dpo.officerEmail ?? ''}`)} testID="account.privacy-dpo-mail" />
              </View>
            ) : null}
          </>
        ) : help.isLoading ? null : (
          <Text color="secondary">{t('privacy.dpoNone')}</Text>
        )}
      </View>

      <Text accessibilityRole="header" variant="title1">
        {t('privacy.whatYouCan')}
      </Text>
      <View>
        {loggedIn ? <ListItem icon={User} onPress={() => router.push('/addresses')} testID="account.privacy-action-data" title={t('privacy.actionData')} /> : null}
        {loggedIn ? <ListItem icon={Download} onPress={() => router.push('/privacy/export' as never)} testID="account.privacy-action-export" title={t('privacy.actionExport')} /> : null}
        {loggedIn ? <ListItem icon={Trash} onPress={() => router.push('/privacy/delete' as never)} testID="account.privacy-action-delete" title={t('privacy.actionDelete')} /> : null}
        {loggedIn ? <ListItem icon={Bell} onPress={() => router.push('/privacy/notifications' as never)} testID="account.privacy-action-prefs" title={t('privacy.actionPrefs')} /> : null}
        <ListItem icon={Document} onPress={() => router.push('/legal/privacy')} testID="account.privacy-action-policy" title={t('privacy.actionPolicy')} />
      </View>
      {dpo?.officerEmail ? (
        <View style={styles.other}>
          <ShieldUser color={theme.color.action.primary} duo={theme.color.brand[300]} size={24} weight="duotone" />
          <Text color="secondary" style={styles.flex}>
            {t('privacy.otherRequestHelp')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.space[2], backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.card, padding: theme.space[4] },
  row: { flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap', paddingTop: theme.space[2] },
  other: { flexDirection: 'row', gap: theme.space[3], alignItems: 'center' },
  flex: { flex: 1 },
});
