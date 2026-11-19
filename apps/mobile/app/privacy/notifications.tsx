import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { changeConsent, fetchConsents, type ConsentPurpose } from '../../src/api/privacy-api';
import { Banner } from '../../src/components/Banner';
import { BottomSheet } from '../../src/components/BottomSheet';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Lock } from '../../src/components/icons';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { useToast } from '../../src/components/Toast';
import { enablePush, getPushStatus, openNotificationSettings, type PushStatus } from '../../src/features/notifications/push';
import { t } from '../../src/i18n';
import { haptic } from '../../src/lib/haptics';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

const key = ['me', 'consents'] as const;

/**
 * CC6. Notificações e consentimentos (WB-196, 211, 190). Avisos de pedido e troca são sempre ligados; ofertas por aviso e por e-mail
 * são dois consentimentos separados, desligados por padrão, que valem na hora (cada Switch salva sozinho, com o estado dito em texto).
 * A permissão do sistema só é pedida aqui, depois da explicação. Textos [validar com jurídico].
 */
export default function NotificationPrefsScreen() {
  const toast = useToast();
  const online = useOnline();
  const client = useQueryClient();
  const consents = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchConsents(signal), staleTime: 0 });
  const [saving, setSaving] = useState<ConsentPurpose | null>(null);
  const [system, setSystem] = useState<PushStatus>('undetermined');
  const [explain, setExplain] = useState(false);

  useEffect(() => {
    void getPushStatus().then(setSystem);
  }, []);

  const header = <Header title={t('privacy.prefsTitle')} />;

  if (consents.isLoading) {
    return (
      <Screen header={header} testID="account.prefs-skeleton">
        {[0, 1, 2].map((i) => (
          <Skeleton height={72} key={i} radius={theme.radius.card} />
        ))}
      </Screen>
    );
  }
  if (consents.isError || !consents.data) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={() => void consents.refetch()} retryLabel={t('common.tryAgain')} testID="account.prefs-error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }

  const state = consents.data.consents;

  const set = async (purpose: ConsentPurpose, granted: boolean) => {
    if (saving) return;
    if (!online) {
      toast.show(t('privacy.prefsOffline'));
      return;
    }
    setSaving(purpose);
    try {
      const next = await changeConsent(purpose, granted);
      client.setQueryData(key, next);
      void haptic('selection');
      toast.show(granted ? t('privacy.prefsOnToast') : t('privacy.prefsOffToast'));
    } catch {
      // volta ao valor antigo (o cache não mudou) e explica
      void haptic('error');
      toast.show(t('privacy.prefsSaveError'));
    } finally {
      setSaving(null);
    }
  };

  const togglePush = async (next: boolean) => {
    // Ligar sem a permissão do sistema: primeiro a explicação, depois o pedido do sistema (no contexto, nunca antes)
    if (next && system !== 'granted') {
      setExplain(true);
      return;
    }
    await set('marketing_push', next);
  };

  const allowPush = async () => {
    setExplain(false);
    const result = await enablePush();
    setSystem(result);
    if (result === 'granted') await set('marketing_push', true);
    else if (result === 'blocked') await openNotificationSettings();
  };

  return (
    <Screen header={header} testID="account.prefs-screen">
      <Text accessibilityRole="header" variant="poster">
        {t('privacy.prefsTitle')}
      </Text>

      <View style={styles.group} testID="account.prefs-orders">
        <Text accessibilityRole="header" variant="title1">
          {t('privacy.prefsOrdersTitle')}
        </Text>
        <View accessible style={styles.card}>
          <View style={styles.lockRow}>
            <Lock color={theme.color.action.primary} duo={theme.color.brand[300]} size={22} weight="duotone" />
            <Text variant="bodyStrong">{t('privacy.prefsOrdersAlways')}</Text>
          </View>
          <Text color="secondary">{t('privacy.prefsOrdersText')}</Text>
        </View>
        <View style={styles.systemRow} testID="account.prefs-system-status">
          <Text color={system === 'granted' ? 'success' : 'warning'} style={styles.flex} variant="captionStrong">
            {system === 'granted' ? t('privacy.prefsSystemOn') : t('privacy.prefsSystemOff')}
          </Text>
          {system !== 'granted' ? <Button label={t('privacy.prefsOpenSettings')} onPress={() => void openNotificationSettings()} testID="account.prefs-open-settings" variant="text" /> : null}
        </View>
      </View>

      <View style={styles.group}>
        <Text accessibilityRole="header" variant="title1">
          {t('privacy.prefsOffersTitle')}
        </Text>
        <Text color="secondary">{t('privacy.prefsOffersText')}</Text>
        <SwitchRow label={t('privacy.prefsOffersPush')} on={state.marketing_push} onChange={(v) => void togglePush(v)} pending={saving === 'marketing_push'} testID="account.prefs-offers-push" />
        <SwitchRow label={t('privacy.prefsOffersEmail')} on={state.marketing_email} onChange={(v) => void set('marketing_email', v)} pending={saving === 'marketing_email'} testID="account.prefs-offers-email" />
      </View>

      <View style={styles.group}>
        <Text accessibilityRole="header" variant="title1">
          {t('privacy.prefsLocationTitle')}
        </Text>
        <Text color="secondary">{t('privacy.prefsLocationText')}</Text>
        <Button label={t('privacy.prefsOpenSettings')} onPress={() => void openNotificationSettings()} variant="secondary" />
        {state.waitlist ? (
          <SwitchRow label={t('privacy.prefsWaitlist')} on={state.waitlist} onChange={(v) => void set('waitlist', v)} pending={saving === 'waitlist'} testID="account.prefs-waitlist" />
        ) : null}
      </View>

      {!online ? <Banner text={t('privacy.prefsOffline')} tone="warning" /> : null}

      <BottomSheet onClose={() => setExplain(false)} title={t('privacy.prefsExplainTitle')} visible={explain}>
        <View testID="account.prefs-permission-explain" style={styles.group}>
          <Text>{t('privacy.prefsExplainText')}</Text>
          <Button label={t('privacy.prefsAllow')} onPress={() => void allowPush()} size="lg" testID="account.prefs-allow" />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function SwitchRow({ label, on, onChange, pending, testID }: { label: string; on: boolean; onChange: (next: boolean) => void; pending: boolean; testID: string }) {
  const stateText = on ? t('privacy.prefsOn') : t('privacy.prefsOff');
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{label}</Text>
        <Text color="secondary" variant="caption">
          {stateText}
        </Text>
      </View>
      <Switch
        accessibilityLabel={`${label}, ${stateText}`}
        accessibilityRole="switch"
        disabled={pending}
        ios_backgroundColor={theme.color.neutral[300]}
        onValueChange={onChange}
        testID={testID}
        thumbColor={theme.color.neutral[0]}
        trackColor={{ false: theme.color.neutral[500], true: theme.color.action.primary }}
        value={on}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: theme.space[3], paddingTop: theme.space[3] },
  card: { gap: theme.space[1], backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.card, padding: theme.space[4] },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2] },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], minHeight: theme.size.touchMin },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: 56 },
  flex: { flex: 1 },
});
