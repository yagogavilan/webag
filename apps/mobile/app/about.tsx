import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Header } from '../src/components/Header';
import { Document, Receipt, ShieldUser } from '../src/components/icons';
import { ListItem } from '../src/components/ListItem';
import { Logo } from '../src/components/Logo';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { useToast } from '../src/components/Toast';
import { LinkErrorDialog } from '../src/features/legal/LinkErrorDialog';
import { openExternal, webPageUrl } from '../src/features/legal/open-link';
import { t } from '../src/i18n';
import { theme } from '../src/theme';

/** "Versão 1.0.0 (123)": a versão do app e o número do build nativo (quando o binário tem). */
export function versionLabel(version: string, build: string | null | undefined): string {
  return build ? t('about.version', { version, build }) : t('about.versionOnly', { version });
}

/** Sobre o Webag (CC1, onda-7-licencas.md §1): versão (toque longo copia), Termos, Política e Licenças. Pública: visitante usa. */
export default function AboutScreen() {
  const router = useRouter();
  const toast = useToast();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const version = Constants.expoConfig?.version ?? '';
  const label = versionLabel(version, Constants.nativeBuildVersion);

  const open = async (path: '/termos' | '/privacidade') => {
    const url = webPageUrl(path);
    if (!(await openExternal(url))) setFailedUrl(url);
  };

  return (
    <Screen header={<Header title={t('about.title')} />} testID="about.screen">
      <View style={styles.brand}>
        <Logo height={44} />
        <Pressable
          accessibilityHint={t('about.versionCopied')}
          accessibilityLabel={label}
          accessibilityRole="button"
          onLongPress={() => void Clipboard.setStringAsync(label).then(() => toast.show(t('about.versionCopied')))}
          style={styles.version}
          testID="about.version"
        >
          <Text color="secondary" variant="caption">
            {label}
          </Text>
        </Pressable>
      </View>
      <View style={styles.list}>
        <ListItem icon={Receipt} onPress={() => void open('/termos')} testID="about.terms" title={t('about.terms')} />
        <ListItem icon={ShieldUser} onPress={() => void open('/privacidade')} testID="about.policy" title={t('about.policy')} />
        <ListItem icon={Document} onPress={() => router.push('/licenses' as never)} testID="about.licenses" title={t('about.licenses')} />
      </View>
      <LinkErrorDialog onClose={() => setFailedUrl(null)} url={failedUrl} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'flex-start', gap: theme.space[2], paddingVertical: theme.space[3] },
  version: { minHeight: theme.size.controlMd, justifyContent: 'center' },
  list: { gap: theme.space[1] },
});
