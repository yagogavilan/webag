import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { payExchangeFee } from '../../../src/api/exchanges-api';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { Dialog } from '../../../src/components/Dialog';
import { Header } from '../../../src/components/Header';
import { Check, Copy, WhatsappLogo, XCircle } from '../../../src/components/icons';
import { Screen } from '../../../src/components/Screen';
import { Skeleton } from '../../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { useOrder } from '../../../src/features/checkout/hooks';
import { exchangeKey, useCancelExchange, useExchange, useExchangePayment } from '../../../src/features/exchanges/hooks';
import { exchangeSteps, formatDay, isExchangeFailed, isExchangeOpen, nextStepText } from '../../../src/features/exchanges/model';
import { openWhatsapp } from '../../../src/features/orders/links';
import { formatDateTime } from '../../../src/features/orders/model';
import { useInvalidateOnEvent } from '../../../src/features/realtime/useRealtime';
import { t } from '../../../src/i18n';
import { formatMoney } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

/**
 * X2b. Acompanhar a troca: próximo passo em uma frase, linha do tempo de 7 passos, extrato fechado pelo servidor e pagamento
 * da taxa (PIX) só depois da aprovação. O estado vem do servidor (REST + canal /rt); o app nunca marca pago.
 */
export default function ExchangeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exchangeId = String(id ?? '');
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const online = useOnline();
  const { connected } = useInvalidateOnEvent(undefined);
  const query = useExchange(exchangeId, { connected });
  const x = query.data;
  const order = useOrder(x?.orderId ?? '', { poll: false });
  const cancel = useCancelExchange(exchangeId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [started, setStarted] = useState(false);
  const payment = useExchangePayment(exchangeId, started);
  const [copied, setCopied] = useState(false);

  const paidByServer = started && payment.data?.status === 'approved' && x?.status === 'awaiting_fee';
  // Pagamento aprovado pelo servidor: refaz a leitura da troca (o estado muda por webhook, nunca por aqui)
  useEffect(() => {
    if (paidByServer) void client.invalidateQueries({ queryKey: exchangeKey(exchangeId) });
  }, [paidByServer, client, exchangeId]);

  const header = <Header title={x ? t('exchange.detailTitle', { number: x.number }) : t('exchange.listTitle')} />;

  if (query.isLoading) {
    return (
      <Screen header={header} testID="exchange.skeleton">
        <Skeleton height={120} radius={theme.radius.xl} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton height={32} key={i} />
        ))}
      </Screen>
    );
  }
  if (query.isError && !x) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={() => void query.refetch()} retryLabel={t('common.tryAgain')} testID="exchange.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  if (!x) {
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('exchange.listEmptyAction')} onAction={() => router.replace('/orders' as never)} testID="exchange.not-found" title={t('exchange.notFound')} />
      </Screen>
    );
  }

  const steps = exchangeSteps(x.status);
  const failed = isExchangeFailed(x.status);
  const phone = order.data?.store.whatsapp ?? null;
  const pix = payment.data?.pix ?? null;
  const talk = () => void openWhatsapp(phone, t('order.whatsappMessage', { number: x.orderNumber })).then((ok) => !ok && toast.show(t('order.whatsappFailed', { phone: phone ?? '' })));

  const onPay = async () => {
    if (!online) return toast.show(t('exchange.errOffline'));
    setPaying(true);
    try {
      await payExchangeFee(exchangeId, { paymentMethod: 'pix' });
      setStarted(true);
      void haptic('success');
    } catch {
      toast.show(t('checkout.providerDown'));
    } finally {
      setPaying(false);
    }
  };

  const onCancel = async () => {
    try {
      await cancel.mutateAsync();
      setCancelOpen(false);
      void haptic('success');
      toast.show(t('exchange.cancelDone'));
    } catch {
      setCancelOpen(false);
      toast.show(t('exchange.cancelFailed'));
    }
  };

  return (
    <Screen header={header} testID="exchange.detail">
      {!online ? <Banner text={t('order.offline')} tone="warning" /> : null}
      <View accessibilityLiveRegion="polite" style={failed ? styles.failedCard : styles.next} testID="exchange.next-step">
        <Text color={failed ? 'danger' : 'onBrand'} variant="captionStrong">
          {failed ? t(`exchange.status.${x.status}` as 'exchange.status.rejected') : t('exchange.next')}
        </Text>
        <Text style={failed ? undefined : styles.onBrand} variant="title2">
          {nextStepText(x, formatMoney)}
        </Text>
      </View>

      {x.status === 'rejected' ? (
        <View style={styles.reject} testID="exchange.rejected-card">
          <View style={styles.row}>
            <XCircle color={theme.color.feedback.danger.base} size={theme.size.iconMd} weight="fill" />
            <Text variant="bodyStrong">{t('exchange.rejectedTitle')}</Text>
          </View>
          {x.decisionReason ? <Text testID="exchange.rejected-reason">{t('exchange.rejectedReason', { reason: x.decisionReason })}</Text> : null}
          <Text accessibilityRole="header" variant="bodyStrong">{t('exchange.rejectedDo')}</Text>
          {phone ? <Button icon={<WhatsappLogo color={theme.color.text.brand} size={theme.size.iconMd} />} label={t('exchange.talkStore')} onPress={talk} testID="exchange.contact-store" variant="secondary" /> : null}
        </View>
      ) : null}

      {x.status === 'awaiting_fee' ? (
        <View style={styles.card} testID="exchange.fee-statement">
          <Text accessibilityRole="header" variant="title2">{t('exchange.statement')}</Text>
          <Line label={t('exchange.feeLine')} value={formatMoney(x.fee.amount)} />
          {x.difference.amount !== 0 ? <Line label={t('exchange.diffLine')} value={formatMoney(x.difference.amount)} /> : null}
          <Line bold label={t('exchange.totalLine')} value={formatMoney(x.totalDue.amount)} />
          <Text color="secondary" variant="caption">{t('exchange.feeFixed')}</Text>
          {pix ? (
            <>
              <Text color="secondary">{t('exchange.pixWaiting')}</Text>
              <Text numberOfLines={2} selectable variant="caption">{pix.copyPaste}</Text>
              <Button icon={copied ? <Check color={theme.color.text.onBrand} size={theme.size.iconMd} weight="bold" /> : <Copy color={theme.color.text.onBrand} size={theme.size.iconMd} />} label={copied ? t('pix.copied') : t('exchange.pixCopy')} onPress={() => { void Clipboard.setStringAsync(pix.copyPaste).then(() => { setCopied(true); void haptic('success'); toast.show(t('exchange.pixCopied')); }); }} size="lg" testID="exchange.pix-copy" />
            </>
          ) : (
            <Button label={paying ? t('exchange.paying') : t('exchange.pay', { total: formatMoney(x.totalDue.amount) })} loading={paying} onPress={() => void onPay()} size="lg" testID="exchange.pay" />
          )}
        </View>
      ) : null}

      {x.status === 'approved' && x.method === 'drop_at_store' && x.storeCode ? (
        <View style={styles.card} testID="exchange.store-code">
          <Text color="secondary" variant="caption">{t('exchange.code')}</Text>
          <Text accessibilityLabel={`${t('exchange.code')}: ${x.storeCode.split('').join(' ')}`} variant="numeral">{x.storeCode}</Text>
          {order.data?.pickup?.address ? <Text>{`${t('exchange.address')}: ${order.data.pickup.address}`}</Text> : null}
        </View>
      ) : null}
      {x.status === 'approved' && x.method === 'pickup_at_home' ? <Text color="secondary" testID="exchange.pickup-info">{t('exchange.pickupInfo')}</Text> : null}

      <View accessibilityLabel={t('order.timeline')} style={styles.timeline} testID="exchange.timeline">
        {steps.map((s, i) => (
          <View accessible accessibilityLabel={t('order.stepA11y', { n: i + 1, total: steps.length, label: s.label, state: s.state === 'done' ? t('order.stepDoneNoTime') : s.state === 'current' ? t('order.stepCurrent') : t('order.stepUpcoming') })} key={s.label} style={styles.step}>
            <View style={[styles.dot, s.state === 'done' && styles.dotDone, s.state === 'current' && styles.dotCurrent]}>
              {s.state === 'done' ? <Check color={theme.color.text.onBrand} size={12} weight="bold" /> : null}
            </View>
            <Text color={s.state === 'upcoming' ? 'secondary' : 'primary'} variant={s.state === 'current' ? 'bodyStrong' : 'body'}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text>{`${x.item?.name ?? ''}`}</Text>
        <Text color="secondary" variant="caption">{`${t('exchange.status.' + x.status as 'exchange.status.requested')} · ${formatDateTime(x.createdAt)}`}</Text>
        <Text color="secondary" variant="caption">{x.resolution === 'refund' ? t('exchange.resolutionRefund') : t('exchange.resolutionReplace')}</Text>
        {x.refund.amount > 0 ? <Text variant="bodyStrong">{t('exchange.refundAmount', { value: formatMoney(x.refund.amount) })}</Text> : null}
        {isExchangeOpen(x.status) ? <Text color="secondary" variant="caption">{`${t('exchange.dueDate', { date: formatDay(x.windowEndsAt) })}`}</Text> : null}
      </View>

      <View style={styles.actions}>
        {phone && !failed ? <Button icon={<WhatsappLogo color={theme.color.text.brand} size={theme.size.iconMd} />} label={t('exchange.talkStore')} onPress={talk} testID="exchange.contact-store" variant="secondary" /> : null}
        {x.status === 'completed' ? <Button label={t('exchange.rate')} onPress={() => router.push({ pathname: '/review/[orderId]', params: { orderId: x.orderId } } as never)} testID="exchange.rate" variant="secondary" /> : null}
        {x.status === 'requested' || x.status === 'awaiting_fee' || x.status === 'approved' ? <Button label={t('exchange.cancel')} onPress={() => setCancelOpen(true)} testID="exchange.cancel" variant="text" /> : null}
      </View>

      <Dialog onClose={() => setCancelOpen(false)} testID="exchange.cancel-dialog" text={t('exchange.cancelText')} title={t('exchange.cancelTitle')} visible={cancelOpen}>
        <Button label={t('exchange.cancelKeep')} onPress={() => setCancelOpen(false)} />
        <Button label={t('exchange.cancel')} loading={cancel.isPending} onPress={() => void onCancel()} testID="exchange.cancel-confirm" variant="destructive" />
      </Dialog>
    </Screen>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.line}>
      <Text variant={bold ? 'bodyStrong' : 'body'}>{label}</Text>
      <Text variant={bold ? 'bodyStrong' : 'body'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  next: { backgroundColor: theme.color.action.primary, borderRadius: theme.radius.hero, padding: theme.space[5], gap: theme.space[2] },
  failedCard: { backgroundColor: theme.color.feedback.danger.subtle, borderRadius: theme.radius.xl, padding: theme.space[4], gap: theme.space[2] },
  onBrand: { color: theme.color.text.onBrand },
  reject: { backgroundColor: theme.color.feedback.danger.subtle, borderColor: theme.color.feedback.danger.border, borderWidth: theme.borderWidth.hairline, borderRadius: theme.radius.xl, padding: theme.space[4], gap: theme.space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2] },
  card: { backgroundColor: theme.color.surface.card, borderRadius: theme.radius.xl, padding: theme.space[4], gap: theme.space[2], borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.subtle },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  timeline: { gap: theme.space[3] },
  step: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: 32 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.color.border.strong, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.neutral[0] },
  dotDone: { backgroundColor: theme.color.action.primary, borderColor: theme.color.action.primary },
  dotCurrent: { borderColor: theme.color.action.primary, borderWidth: 6 },
  actions: { gap: theme.space[2] },
});
