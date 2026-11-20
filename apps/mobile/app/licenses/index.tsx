import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Header } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { LinkErrorDialog } from '../../src/features/legal/LinkErrorDialog';
import { openExternal, webPageUrl, type LinkKind } from '../../src/features/legal/open-link';
import { t } from '../../src/i18n';
import { CREDITS, type Credit } from '../../src/legal/credits';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

/**
 * Licenças de código aberto (onda-7-licencas.md, DEC-055): créditos do Solar (CC BY 4.0, atribuição obrigatória), das fontes (OFL)
 * e do glifo do WhatsApp (MIT). Tudo local, abre sem rede. A lista de bibliotecas npm é a página pública `/licencas` (gerada por
 * `pnpm licencas`), aberta no navegador do sistema.
 */
export default function LicensesScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const open = async (url: string, kind: LinkKind = 'license') => {
    if (!online) {
      toast.show(t('about.offline'));
      return;
    }
    if (!(await openExternal(url, kind))) setFailedUrl(url);
  };
  const detail = (id: Credit['id']) => router.push({ pathname: '/licenses/[id]', params: { id } } as never);

  const group = (kind: Credit['group'], title: string) => (
    <View style={styles.section}>
      <Text accessibilityRole="header" variant="title2">
        {title}
      </Text>
      {CREDITS.filter((c) => c.group === kind).map((c) => (
        <Card key={c.id} style={styles.card} testID={`licenses.${c.id}`} tone="card">
          <Pressable
            accessibilityLabel={t('licenses.openDetails', { name: c.name, author: c.by, license: c.licenseShort })}
            accessibilityRole="button"
            onPress={() => detail(c.id)}
            style={styles.cardBody}
            testID={`licenses.${c.id}-open`}
          >
            <Text variant="bodyStrong">{c.name}</Text>
            <Text color="secondary">{t('licenses.by', { author: c.by })}</Text>
            {c.copyright ? (
              <Text color="secondary" variant="caption">
                {c.copyright}
              </Text>
            ) : null}
            <Text>{c.licenseName}</Text>
            {c.changes ? <Text>{t('licenses.changes', { text: c.changes })}</Text> : null}
            {c.id === 'solar' ? (
              <Text color="secondary" variant="caption">
                {t('licenses.warranty')}
              </Text>
            ) : null}
          </Pressable>
          <View style={styles.links}>
            <Button label={t('licenses.viewLicense')} onPress={() => void open(c.licenseUrl)} testID={`licenses.${c.id}-license`} variant="text" />
            <Button label={t('licenses.viewProject')} onPress={() => void open(c.projectUrl)} testID={`licenses.${c.id}-project`} variant="text" />
          </View>
        </Card>
      ))}
    </View>
  );

  return (
    <Screen header={<Header title={t('licenses.title')} />} testID="licenses.screen">
      <Text color="secondary">{t('licenses.intro')}</Text>
      {group('icons', t('licenses.icons'))}
      {group('fonts', t('licenses.fonts'))}
      <Text color="secondary" variant="caption">
        {t('licenses.logoNote')}
      </Text>
      <View style={styles.section}>
        <Text accessibilityRole="header" variant="title2">
          {t('licenses.libs')}
        </Text>
        <Text color="secondary">{t('licenses.libsText')}</Text>
        <Button label={t('licenses.libsOpen')} onPress={() => void open(webPageUrl('/licencas'), 'web')} testID="licenses.libs-open" variant="secondary" />
      </View>
      <LinkErrorDialog onClose={() => setFailedUrl(null)} url={failedUrl} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.space[3], paddingTop: theme.space[3] },
  card: { backgroundColor: theme.color.surface.sunken, gap: theme.space[1] },
  cardBody: { gap: theme.space[1], paddingVertical: theme.space[1] },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] },
});
