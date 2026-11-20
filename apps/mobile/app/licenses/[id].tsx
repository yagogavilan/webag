import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { LinkErrorDialog } from '../../src/features/legal/LinkErrorDialog';
import { openExternal } from '../../src/features/legal/open-link';
import { t } from '../../src/i18n';
import { creditById } from '../../src/legal/credits';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

/** Detalhe da licença (onda-7-licencas.md §2.2): aviso de copyright e texto integral, selecionável. Rola; abre sem rede. */
export default function LicenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const credit = creditById(String(id ?? ''));
  const toast = useToast();
  const online = useOnline();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!credit) {
    return (
      <Screen header={<Header title={t('licenses.title')} />} testID="license-detail.not-found">
        <Text>{t('licenses.notFound')}</Text>
      </Screen>
    );
  }
  const onOpen = async () => {
    if (!online) {
      toast.show(t('about.offline'));
      return;
    }
    if (!(await openExternal(credit.licenseUrl, 'license'))) setFailedUrl(credit.licenseUrl);
  };

  return (
    <Screen header={<Header title={credit.name} />} testID="license-detail.screen">
      <View style={styles.block}>
        <Text accessibilityRole="header" testID="license-detail.title" variant="title2">
          {credit.name}
        </Text>
        <Text color="secondary">{t('licenses.by', { author: credit.by })}</Text>
        <Text>{credit.licenseName}</Text>
        {credit.changes ? <Text>{t('licenses.changes', { text: credit.changes })}</Text> : null}
        {credit.fullText ? (
          <Text selectable testID="license-detail.text" variant="caption">
            {credit.fullText}
          </Text>
        ) : (
          <Text color="secondary" selectable testID="license-detail.text">
            {`${t('licenses.detailNoText')}\n${credit.licenseUrl}`}
          </Text>
        )}
      </View>
      <Button label={t('licenses.openBrowser')} onPress={() => void onOpen()} testID="license-detail.open-link" variant="secondary" />
      <LinkErrorDialog onClose={() => setFailedUrl(null)} url={failedUrl} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.space[3] },
});
