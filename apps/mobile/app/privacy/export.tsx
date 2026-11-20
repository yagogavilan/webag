import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { askDataExport, exportDownloadLink, fetchDataExport } from '../../src/api/privacy-api';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { CheckCircle, Download } from '../../src/components/icons';
import { PasswordField } from '../../src/components/PasswordField';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { openExternal } from '../../src/features/legal/open-link';
import { toPasswordActionError } from '../../src/features/privacy/errors';
import { t } from '../../src/i18n';
import { formatWhen } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

const exportKey = ['me', 'data-export'] as const;

/**
 * CC3. Exportar meus dados (LGPD art. 18, SEC-166): pedir com a senha, acompanhar o status e abrir o link de uso único.
 * O arquivo nunca passa pelo app: o link abre no navegador do sistema e vale poucos minutos. Textos [validar com jurídico].
 */
export default function ExportDataScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: exportKey,
    queryFn: ({ signal }) => fetchDataExport(signal),
    staleTime: 0,
    // Em fila ou montando: confere a cada 15 s; o e-mail avisa quando ficar pronta
    refetchInterval: (q) => (q.state.data?.latest && ['queued', 'processing'].includes(q.state.data.latest.status) ? 15_000 : false),
  });
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [linking, setLinking] = useState(false);
  const [now] = useState(() => Date.now());

  const header = <Header title={t('privacy.exportTitle')} />;
  const latest = status.data?.latest ?? null;
  const inProgress = latest ? latest.status === 'queued' || latest.status === 'processing' : false;
  const nextAt = status.data?.nextRequestAt ?? null;
  const limited = nextAt !== null && new Date(nextAt).getTime() > now && !inProgress;

  if (requested) {
    return (
      <Screen header={header} testID="account.export-done">
        <View style={styles.done}>
          <CheckCircle color={theme.color.feedback.success.base} duo={theme.color.feedback.success.border} size={72} weight="duotone" />
          <Text variant="poster">{t('privacy.exportDone')}</Text>
          <Text color="secondary">{t('privacy.exportDoneText')}</Text>
          <Button label={t('common.back')} onPress={() => router.back()} size="lg" testID="account.export-back" />
        </View>
      </Screen>
    );
  }

  const submit = async () => {
    if (busy) return;
    if (!online) {
      setError(t('privacy.offlineAction'));
      return;
    }
    if (!password) {
      setError(t('privacy.passwordEmpty'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await askDataExport(password);
      void haptic('success');
      setPassword('');
      void client.invalidateQueries({ queryKey: exportKey });
      setRequested(true);
    } catch (e) {
      void haptic('error');
      const mapped = toPasswordActionError(e);
      if (mapped.kind === 'email-unverified') setNeedsEmail(true);
      if (mapped.kind === 'busy' || mapped.kind === 'limit') void client.invalidateQueries({ queryKey: exportKey });
      setError('message' in mapped ? mapped.message : t('privacy.cantNow'));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!latest || linking) return;
    setLinking(true);
    try {
      const link = await exportDownloadLink(latest.id);
      // Uso único e curta duração: abre no navegador do sistema, que baixa o JSON. O app não guarda o arquivo (dado pessoal).
      // O link vem da API, mas só a origem da API (https em produção) é aberta (SEC-172).
      if (!(await openExternal(link.url, 'api'))) toast.show(t('privacy.cantNow'));
    } catch (e) {
      const mapped = toPasswordActionError(e);
      toast.show('message' in mapped ? mapped.message : t('privacy.cantNow'));
      void client.invalidateQueries({ queryKey: exportKey });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Screen header={header} testID="account.export-screen">
      <Text accessibilityRole="header" variant="poster">
        {t('privacy.exportTitle')}
      </Text>
      <Text>{t('privacy.exportIntro')}</Text>
      <Text color="secondary" variant="caption">
        {t('privacy.exportLeaves')}
      </Text>

      {status.isLoading ? (
        <Skeleton height={88} radius={theme.radius.card} />
      ) : status.isError && !status.data ? (
        <ErrorState offline={!online} onRetry={() => void status.refetch()} retryLabel={t('common.tryAgain')} testID="account.export-error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      ) : (
        <>
          {latest ? (
            <View accessible style={styles.card} testID="account.export-status">
              <Text variant="bodyStrong">
                {latest.status === 'queued' || latest.status === 'processing'
                  ? t('privacy.exportStatusQueued', { when: formatWhen(latest.requestedAt) })
                  : latest.status === 'ready'
                    ? t('privacy.exportStatusReady', { when: latest.expiresAt ? formatWhen(latest.expiresAt, { time: false }) : '' })
                    : latest.status === 'expired'
                      ? t('privacy.exportStatusExpired', { when: latest.expiresAt ? formatWhen(latest.expiresAt, { time: false }) : '' })
                      : t('privacy.exportStatusFailed')}
              </Text>
              {latest.status === 'ready' ? (
                <>
                  <Text color="secondary" variant="caption">
                    {t('privacy.exportDownloadHint')}
                  </Text>
                  <Button icon={<Download color={theme.color.neutral[0]} size={20} weight="bold" />} label={t('privacy.exportDownload')} loading={linking} onPress={() => void download()} testID="account.export-download" />
                </>
              ) : null}
            </View>
          ) : null}

          {limited && nextAt ? (
            <Text color="secondary" testID="account.export-limit" variant="caption">
              {t('privacy.exportLimit', { when: `em ${formatWhen(nextAt)}` })}
            </Text>
          ) : null}

          {needsEmail ? <Banner actionLabel={t('privacy.exportConfirmEmail')} onAction={() => router.push('/verify-email')} testID="account.export-email-banner" text={t('privacy.exportEmailNeeded')} tone="warning" /> : null}

          <PasswordField
            error={error ?? undefined}
            label={t('privacy.exportPassword')}
            mode="current"
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            onToggleVisible={() => setVisible((v) => !v)}
            testID="account.export-password-input"
            value={password}
            visible={visible}
          />
          <Button
            disabled={inProgress}
            label={inProgress ? t('privacy.exportBusy') : t('privacy.exportSubmit')}
            loading={busy}
            onPress={() => void submit()}
            size="lg"
            testID="account.export-submit"
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.space[2], backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.card, padding: theme.space[4] },
  done: { gap: theme.space[4], paddingTop: theme.space[10] },
});
