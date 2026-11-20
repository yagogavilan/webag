import { useQuery } from '@tanstack/react-query';
import type { DeletionBlocker } from '@webag/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { fetchDeletionOverview, removeMyAccount } from '../../src/api/privacy-api';
import { useSession, sessionStore } from '../../src/api/session';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Dialog } from '../../src/components/Dialog';
import { Header } from '../../src/components/Header';
import { Lock, Receipt, Trash, User, Info, Clock } from '../../src/components/icons';
import { PasswordField } from '../../src/components/PasswordField';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { cartActions } from '../../src/features/cart/store';
import { presentStatus } from '../../src/features/orders/model';
import { CancelDeletionForm } from '../../src/features/privacy/CancelDeletionForm';
import { toPasswordActionError } from '../../src/features/privacy/errors';
import { t } from '../../src/i18n';
import { formatWhen } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

const ORDER_STATUSES = ['awaiting_payment', 'received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup'] as const;
const EXCHANGE_STATUS_KEY = { requested: 'exchange.status.requested', awaiting_fee: 'exchange.status.awaiting_fee', approved: 'exchange.status.approved', item_received: 'exchange.status.item_received', in_mediation: 'exchange.status.in_mediation' } as const;

/** O servidor manda o estado em código (`out_for_delivery`); a tela mostra o rótulo em português, igual ao resto do app. */
const blockerStatus = (b: DeletionBlocker): string => {
  if ((ORDER_STATUSES as readonly string[]).includes(b.status)) return presentStatus(b.status as (typeof ORDER_STATUSES)[number]).label;
  if (b.status in EXCHANGE_STATUS_KEY) return t(EXCHANGE_STATUS_KEY[b.status as keyof typeof EXCHANGE_STATUS_KEY]);
  if (b.status === 'processing') return t('privacy.blockerRefundProcessing');
  return b.status;
};

const blockerText = (b: DeletionBlocker): string => {
  const key = { order: 'privacy.blockerOrder', exchange: 'privacy.blockerExchange', store_order: 'privacy.blockerStoreOrder', store_exchange: 'privacy.blockerStoreExchange', store_refund: 'privacy.blockerStoreRefund' } as const;
  return t(key[b.kind], { n: b.number ?? '', status: blockerStatus(b) });
};

/**
 * CC4. Excluir minha conta (Apple 5.1.1(v), SEC-166). Só a senha confirma (DEC-014/015). Arrependimento de `regretHours` com
 * cancelamento da exclusão. Os números (dias, anos, horas) vêm do servidor, nunca fixos. Textos [validar com jurídico].
 * Esta rota fica FORA de `(customer)`: o fim da sessão limpa os endereços e aquele layout redirecionaria antes do "Sua conta foi excluída".
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const online = useOnline();
  const session = useSession();
  const overview = useQuery({ queryKey: ['me', 'deletion'], queryFn: ({ signal }) => fetchDeletionOverview(signal), staleTime: 0 });
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ pending: boolean; until: string | null; email: string } | null>(null);
  const [undo, setUndo] = useState(false);
  const email = session.status === 'authenticated' ? session.user.email : '';

  const header = <Header title={t('privacy.deleteTitle')} />;

  if (done) {
    return (
      <Screen testID="account.delete-done">
        <View style={styles.done}>
          <View style={styles.doneIcon}>
            <Trash color={theme.color.neutral[0]} duo={theme.color.accent.base} size={40} weight="duotone" />
          </View>
          <Text style={styles.center} variant="poster">
            {t('privacy.deleteDoneTitle')}
          </Text>
          <Text color="secondary" style={styles.center}>
            {t('privacy.deleteDoneText')}
          </Text>
          {done.pending && done.until ? <Banner testID="account.delete-regret" text={t('privacy.deleteDonePending', { until: formatWhen(done.until) })} tone="info" /> : null}
          {undo ? (
            <CancelDeletionForm initialEmail={done.email} onDone={() => router.replace('/login')} />
          ) : done.pending ? (
            <Button label={t('privacy.deleteUndo')} onPress={() => setUndo(true)} size="lg" testID="account.delete-undo" variant="secondary" />
          ) : null}
          <Button label={t('privacy.deleteDoneClose')} onPress={() => router.replace('/')} size="lg" testID="account.delete-close" />
        </View>
      </Screen>
    );
  }

  if (overview.isLoading) {
    return (
      <Screen header={header} testID="account.delete-skeleton">
        <Skeleton height={28} width="60%" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton height={20} key={i} />
        ))}
      </Screen>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={() => void overview.refetch()} retryLabel={t('common.tryAgain')} testID="account.delete-error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }

  const o = overview.data;
  if (o.blockers.length > 0) {
    return (
      <Screen header={header}>
        <View style={styles.blocked} testID="account.delete-blockers">
          <Receipt color={theme.color.action.primary} duo={theme.color.brand[300]} size={theme.size.iconEmpty} weight="duotone" />
          <Text variant="title1">{t('privacy.deleteBlockedTitle')}</Text>
          <Text color="secondary">{t('privacy.deleteBlockedText')}</Text>
          {o.blockers.map((b) => (
            <View accessible key={b.id} style={styles.blocker} testID={`account.delete-blocker-${b.id}`}>
              <Text variant="bodyStrong">{blockerText(b)}</Text>
            </View>
          ))}
          <Button label={t('privacy.deleteBlockedOrders')} onPress={() => router.replace('/orders' as never)} size="lg" testID="account.delete-orders" />
        </View>
      </Screen>
    );
  }
  if (!o.canDelete) {
    return (
      <Screen header={header}>
        <Banner text={t('privacy.deleteAdmin')} tone="info" />
      </Screen>
    );
  }

  const submit = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      const result = await removeMyAccount(password);
      void haptic('success');
      // A conta fechou no servidor: sessões e aparelhos de push já foram revogados lá. Aqui sai tudo do aparelho (sacola, endereços, buscas).
      const mail = email;
      await cartActions.clear();
      await sessionStore.clear();
      setPassword('');
      setDone({ pending: result.status === 'pending', until: result.cancelableUntil, email: mail });
    } catch (e) {
      void haptic('error');
      const mapped = toPasswordActionError(e);
      if (mapped.kind === 'blocked') void overview.refetch();
      setError(mapped.kind === 'other' ? t('privacy.deleteError') : 'message' in mapped ? mapped.message : t('privacy.deleteError'));
    } finally {
      setBusy(false);
    }
  };

  const onPress = () => {
    if (!online) {
      setError(t('privacy.offlineAction'));
      return;
    }
    if (!password) {
      setError(t('privacy.passwordEmpty'));
      return;
    }
    setError(null);
    void haptic('warning');
    setConfirming(true);
  };

  return (
    <Screen header={header} testID="account.delete-screen">
      <Text accessibilityRole="header" variant="poster">
        {t('privacy.deleteTitle')}
      </Text>
      <View style={styles.info} testID="account.delete-info">
        <Text variant="title1">{t('privacy.deleteWhat')}</Text>
        <Point icon={<Lock color={theme.color.action.primary} duo={theme.color.brand[300]} size={24} weight="duotone" />} text={t('privacy.deleteP1')} />
        <Point icon={<User color={theme.color.action.primary} duo={theme.color.brand[300]} size={24} weight="duotone" />} text={t('privacy.deleteP2', { days: o.anonymizationDays })} />
        <Point icon={<Receipt color={theme.color.action.primary} duo={theme.color.brand[300]} size={24} weight="duotone" />} text={t('privacy.deleteP3', { years: o.fiscalRetentionYears })} />
        <Point icon={<Info color={theme.color.action.primary} duo={theme.color.brand[300]} size={24} weight="duotone" />} text={t('privacy.deleteP4')} />
        {o.ownsStore ? <Point icon={<Info color={theme.color.action.primary} duo={theme.color.brand[300]} size={24} weight="duotone" />} text={t('privacy.deleteStore')} /> : null}
        {o.regretHours > 0 ? <Point icon={<Clock color={theme.color.action.primary} duo={theme.color.brand[300]} size={24} weight="duotone" />} text={t('privacy.deleteRegret', { hours: o.regretHours })} /> : null}
      </View>
      <Button label={t('privacy.deleteExportLink')} onPress={() => router.push('/privacy/export' as never)} testID="account.delete-export-link" variant="text" />

      {o.hasPassword ? (
        <View style={styles.form}>
          <PasswordField
            error={error ?? undefined}
            label={t('privacy.deletePassword')}
            mode="current"
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            onToggleVisible={() => setVisible((v) => !v)}
            testID="account.delete-password-input"
            toggleTestID="account.delete-password-toggle"
            value={password}
            visible={visible}
          />
          <View style={styles.gap} />
          <Button label={t('privacy.deleteSubmit')} loading={busy} onPress={onPress} size="lg" testID="account.delete-submit" variant="destructive" />
        </View>
      ) : (
        <Banner testID="account.delete-no-password" text={t('privacy.deleteNoPassword')} tone="info" />
      )}

      <Dialog onClose={() => setConfirming(false)} testID="account.delete-dialog" text={t('privacy.deleteDialogText')} title={t('privacy.deleteDialogTitle')} visible={confirming}>
        {/* O foco inicial é "Cancelar": o destrutivo nunca é o primeiro botão */}
        <Button label={t('privacy.deleteCancel')} onPress={() => setConfirming(false)} testID="account.delete-cancel" />
        <Button label={t('privacy.deleteConfirm')} onPress={() => void submit()} testID="account.delete-confirm" variant="destructive" />
      </Dialog>
    </Screen>
  );
}

function Point({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={styles.point}>
      {icon}
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  info: { gap: theme.space[3], paddingVertical: theme.space[2] },
  point: { flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' },
  pointText: { flex: 1 },
  form: { gap: theme.space[2], paddingTop: theme.space[3] },
  gap: { height: theme.space[6] },
  blocked: { gap: theme.space[3], alignItems: 'flex-start' },
  blocker: { backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.lg, padding: theme.space[3], alignSelf: 'stretch' },
  done: { gap: theme.space[4], paddingTop: theme.space[10] },
  doneIcon: { width: 88, height: 88, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface.ink, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  center: { textAlign: 'left' },
});
