import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, StyleSheet, View } from 'react-native';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { Dialog } from '../../../src/components/Dialog';
import { Header } from '../../../src/components/Header';
import { Bank, CheckCircle, Clock, Copy } from '../../../src/components/icons';
import { Screen } from '../../../src/components/Screen';
import { Skeleton } from '../../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { useCartParams } from '../../../src/features/cart/hooks';
import { orderKey, paymentKey, useOrder, useOrderPayment } from '../../../src/features/checkout/hooks';
import { reorderItems } from '../../../src/features/orders/reorder';
import { PixRing } from '../../../src/features/pix/PixRing';
import { useSecondsUntil } from '../../../src/features/pix/useSecondsUntil';
import { useInvalidateOnEvent } from '../../../src/features/realtime/useRealtime';
import { t } from '../../../src/i18n';
import { formatCountdown, formatMoney } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';
import { useOnline } from '../../../src/lib/useOnline';
import { useReducedMotion } from '../../../src/lib/useReducedMotion';
import { theme } from '../../../src/theme';

/** Avisos de contagem para leitor de tela: só em 5:00, 1:00, 0:30 e ao vencer (nunca a cada segundo). */
const ANNOUNCE_AT = [300, 60, 30] as const;

/**
 * S5. Pagamento com PIX (WB-024, 158). O app mostra o código e OUVE o servidor (canal /rt e polling com recuo): nunca marca como
 * pago sozinho (SEC-035). Valor, QR e validade vêm de `GET /v1/orders/{id}/payment`.
 */
export default function PixScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = String(orderId ?? '');
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const reduced = useReducedMotion();
  const client = useQueryClient();
  const cartParams = useCartParams();
  useKeepAwake();

  const { connected } = useInvalidateOnEvent(id);
  const order = useOrder(id, { connected });
  const payment = useOrderPayment(id, { connected });
  const pix = payment.data?.pix ?? null;
  const seconds = useSecondsUntil(pix?.expiresAt);

  const [copied, setCopied] = useState(false);
  const [showAlreadyPaid, setShowAlreadyPaid] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announced = useRef(new Set<number>());

  const status = order.data?.status;
  const paid = status !== undefined && status !== 'awaiting_payment' && status !== 'expired' && status !== 'cancelled' && status !== 'refused';
  const expired = status === 'expired' || payment.data?.status === 'expired' || (seconds !== null && seconds === 0 && !paid);
  const cancelled = status === 'cancelled' || status === 'refused';

  // Pago: háptico de sucesso e segue para o "Pedido confirmado" (imediato com "reduzir movimento"; senão deixa o check aparecer).
  useEffect(() => {
    if (!paid) return;
    void haptic('success');
    const timer = setTimeout(() => router.replace({ pathname: '/confirmed/[orderId]', params: { orderId: id } } as never), reduced ? 0 : 1200);
    return () => clearTimeout(timer);
  }, [paid, reduced, router, id]);

  useEffect(() => {
    if (seconds === null || paid) return;
    if (seconds === 0) {
      AccessibilityInfo.announceForAccessibility(t('pix.announceExpired'));
      return;
    }
    const mark = ANNOUNCE_AT.find((s) => seconds <= s && !announced.current.has(s));
    if (mark !== undefined && seconds >= mark - 1) {
      announced.current.add(mark);
      AccessibilityInfo.announceForAccessibility(t('pix.announce', { time: formatCountdown(seconds) }));
    }
  }, [seconds, paid]);

  useEffect(() => () => void (copiedTimer.current && clearTimeout(copiedTimer.current)), []);

  const askLeave = useCallback(() => {
    if (paid || expired || cancelled) {
      router.replace('/orders' as never);
      return;
    }
    setLeaveOpen(true);
  }, [paid, expired, cancelled, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      askLeave();
      return true;
    });
    return () => sub.remove();
  }, [askLeave]);

  const onCopy = async () => {
    if (!pix) return;
    await Clipboard.setStringAsync(pix.copyPaste);
    void haptic('success');
    setCopied(true);
    toast.show(t('pix.copiedToast'));
    setShowAlreadyPaid(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 3000);
  };

  const onAlreadyPaid = async () => {
    const [o] = await Promise.all([order.refetch(), payment.refetch()]);
    if (!o.data || o.data.status === 'awaiting_payment') toast.show(t('pix.notYet'));
  };

  const onRegenerate = async () => {
    if (!order.data || regenerating) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      const result = await reorderItems(order.data, cartParams);
      void client.invalidateQueries({ queryKey: ['cart'] });
      if (result.added === 0) setRegenError(t('pix.regenerateStock', { names: result.missing.join(', ') }));
      else if (result.missing.length > 0) setRegenError(t('pix.regenerateStock', { names: result.missing.join(', ') }));
      else router.replace('/checkout' as never);
    } catch {
      setRegenError(t('pix.regenerateFailed'));
    } finally {
      setRegenerating(false);
    }
  };

  const header = <Header onBack={askLeave} title={t('pix.title')} />;

  if (order.isLoading || payment.isLoading) {
    return (
      <Screen header={header} testID="pix.skeleton">
        <Text color="secondary" style={styles.center}>
          {t('pix.generating')}
        </Text>
        <Skeleton height={32} width="50%" style={styles.centerBox} />
        <Skeleton height={144} radius={72} width={144} style={styles.centerBox} />
        <Skeleton height={240} radius={theme.radius.xl} width={240} style={styles.centerBox} />
        <Skeleton height={56} radius={theme.radius.pill} />
      </Screen>
    );
  }
  if (order.isError && !order.data) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={() => void order.refetch()} retryLabel={t('common.tryAgain')} testID="pix.error" text={t('pix.errorText')} title={t('pix.errorTitle')} />
      </Screen>
    );
  }
  if (!order.data) {
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('pix.viewOrders')} onAction={() => router.replace('/orders' as never)} text={t('order.notFoundText')} title={t('order.notFoundTitle')} />
      </Screen>
    );
  }
  const total = order.data.summary.total.amount;

  if (paid) {
    return (
      <Screen header={<Header onBack={false} title={t('pix.title')} />} testID="pix.paid">
        <View accessibilityLiveRegion="polite" style={styles.paid}>
          <CheckCircle color={theme.color.feedback.success.base} size={theme.size.iconEmpty} weight="fill" />
          <Text style={styles.center} variant="title1">
            {t('pix.paidTitle')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (cancelled) {
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('pix.viewOrders')} icon={Clock} onAction={() => router.replace('/orders' as never)} testID="pix.cancelled" title={t('pix.cancelled')} />
      </Screen>
    );
  }

  if (expired) {
    return (
      <Screen header={header} testID="pix.expired">
        <EmptyState
          actionLabel={regenerating ? t('pix.regenerating') : t('pix.regenerate')}
          icon={Clock}
          onAction={() => void onRegenerate()}
          testID="pix.regenerate"
          text={t('pix.expiredText')}
          title={t('pix.expiredTitle')}
        />
        {regenError ? <Banner actionLabel={t('checkout.backToCart')} onAction={() => router.replace('/cart')} text={regenError} tone="danger" /> : null}
        <Button label={t('pix.viewOrders')} onPress={() => router.replace('/orders' as never)} testID="pix.view-orders" variant="text" />
      </Screen>
    );
  }

  const footer = (
    <View style={styles.footer}>
      <Button
        icon={copied ? <CheckCircle color={theme.color.text.onBrand} size={theme.size.iconMd} weight="bold" /> : <Copy color={theme.color.text.onBrand} size={theme.size.iconMd} />}
        label={copied ? t('pix.copied') : t('pix.copy')}
        onPress={() => void onCopy()}
        size="lg"
        testID="pix.copy"
        {...(pix ? {} : { disabled: true })}
      />
      <View style={styles.links}>
        {showAlreadyPaid ? <Button label={t('pix.alreadyPaid')} onPress={() => void onAlreadyPaid()} testID="pix.already-paid" variant="text" /> : null}
        <Button label={t('pix.viewOrders')} onPress={askLeave} testID="pix.view-orders" variant="text" />
      </View>
    </View>
  );

  return (
    <Screen footer={footer} header={header} testID="pix.screen">
      {!online ? <Banner testID="pix.offline" text={t('pix.offline')} tone="warning" /> : null}
      {payment.isError && payment.data ? <Banner testID="pix.status-error" text={t('pix.statusError')} tone="info" /> : null}
      <View style={styles.amountBox}>
        <Text accessibilityLabel={t('pix.amountA11y', { value: formatMoney(total) })} testID="pix.amount" variant="display">
          {formatMoney(total)}
        </Text>
        <Text color="secondary" variant="caption">
          {t('pix.store', { store: order.data.store.name })}
        </Text>
      </View>
      {seconds !== null ? <PixRing seconds={seconds} /> : null}
      {pix ? (
        <>
          {pix.qrCodeBase64 ? (
            <View style={styles.qrCard}>
              <Image
                accessibilityLabel={t('pix.qrLabel')}
                accessible
                contentFit="contain"
                source={{ uri: `data:image/png;base64,${pix.qrCodeBase64}` }}
                style={styles.qr}
                testID="pix.qr"
              />
            </View>
          ) : null}
          <Text numberOfLines={2} selectable style={styles.code} testID="pix.code" variant="caption">
            {pix.copyPaste}
          </Text>
        </>
      ) : (
        <>
          <Text color="secondary" style={styles.center}>
            {t('pix.generating')}
          </Text>
          <Skeleton height={240} radius={theme.radius.xl} width={240} style={styles.centerBox} />
        </>
      )}
      <View accessibilityRole="list" style={styles.how} testID="pix.how-to">
        <Text accessibilityRole="header" variant="title2">
          {t('pix.howTitle')}
        </Text>
        <HowRow icon={<Copy color={theme.color.text.brand} size={theme.size.iconMd} />} text={t('pix.how1')} />
        <HowRow icon={<Bank color={theme.color.text.brand} size={theme.size.iconMd} />} text={t('pix.how2')} />
        <HowRow icon={<CheckCircle color={theme.color.text.brand} size={theme.size.iconMd} />} text={t('pix.how3')} />
      </View>
      <Dialog onClose={() => setLeaveOpen(false)} testID="pix.leave-dialog" text={t('pix.leaveText', { time: formatCountdown(seconds ?? 0) })} title={t('pix.leaveTitle')} visible={leaveOpen}>
        <Button label={t('pix.leaveStay')} onPress={() => setLeaveOpen(false)} testID="pix.leave-stay" />
        <Button
          label={t('pix.leaveOrders')}
          onPress={() => {
            setLeaveOpen(false);
            void client.invalidateQueries({ queryKey: orderKey(id) });
            void client.invalidateQueries({ queryKey: paymentKey(id) });
            router.replace('/orders' as never);
          }}
          testID="pix.leave-orders"
          variant="secondary"
        />
      </Dialog>
    </Screen>
  );
}

function HowRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View accessibilityRole="text" style={styles.howRow}>
      {icon}
      <Text style={styles.howText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  centerBox: { alignSelf: 'center' },
  paid: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[4], paddingVertical: theme.space[10] },
  amountBox: { alignItems: 'center', gap: theme.space[1] },
  // QR: preto sobre branco, zona de silêncio de pelo menos 16 (spec S5); nunca estilizado.
  qrCard: { alignSelf: 'center', backgroundColor: theme.color.neutral[0], borderRadius: theme.radius.xl, padding: theme.space[4], borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.subtle },
  qr: { width: 240, height: 240 },
  code: { textAlign: 'center', color: theme.color.text.secondary },
  how: { gap: theme.space[3], backgroundColor: theme.color.surface.brandSubtle, borderRadius: theme.radius.xl, padding: theme.space[4] },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3] },
  howText: { flex: 1 },
  footer: { gap: theme.space[1] },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: theme.space[2] },
});
