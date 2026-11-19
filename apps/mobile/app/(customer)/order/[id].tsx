import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { reportNotReceived } from '../../../src/api/orders-api';
import { Banner } from '../../../src/components/Banner';
import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { Dialog } from '../../../src/components/Dialog';
import { Header } from '../../../src/components/Header';
import { ArrowsLeftRight, Star, WhatsappLogo } from '../../../src/components/icons';
import { Screen } from '../../../src/components/Screen';
import { Skeleton } from '../../../src/components/Skeleton';
import { SpeedLines } from '../../../src/components/SpeedLines';
import { EmptyState, ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { ApiError } from '../../../src/api/problem';
import { useCartParams } from '../../../src/features/cart/hooks';
import { PriceSummary } from '../../../src/features/cart/PriceSummary';
import { useOrder } from '../../../src/features/checkout/hooks';
import { getPushStatus, openNotificationSettings, type PushStatus } from '../../../src/features/notifications/push';
import { useCancelOrder } from '../../../src/features/orders/hooks';
import { openDirections, openWhatsapp } from '../../../src/features/orders/links';
import { isActive, formatDateTime, formatHour, itemCountLabel, presentStatus, spacedCode } from '../../../src/features/orders/model';
import { reorderItems } from '../../../src/features/orders/reorder';
import { StatusTimeline } from '../../../src/features/orders/StatusTimeline';
import { useInvalidateOnEvent } from '../../../src/features/realtime/useRealtime';
import { t } from '../../../src/i18n';
import { formatMoney } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

/**
 * S7. Pedido: acompanhar e detalhe (WB-027 a 030, 037). Fonte da verdade é o REST; o canal /rt só avisa (fallback de polling).
 * O que o cliente pode fazer vem de `allowedActions` do servidor: o app não decide regra de cancelamento.
 */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = String(id ?? '');
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const cartParams = useCartParams();
  const { connected } = useInvalidateOnEvent(orderId);
  const query = useOrder(orderId, { connected });
  const cancel = useCancelOrder(orderId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [notReceivedOpen, setNotReceivedOpen] = useState(false);
  const [push, setPush] = useState<PushStatus>('granted');
  const order = query.data;

  useEffect(() => {
    void getPushStatus().then(setPush);
  }, []);

  // Cada mudança de estado dá um toque leve e é anunciada pelo leitor de tela (região viva no selo).
  const status = order?.status;
  useEffect(() => {
    if (status) void haptic('light');
  }, [status]);

  const header = <Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/orders' as never))} title={order ? t('order.title', { number: order.number }) : t('orders.title')} {...(order ? { subtitle: order.store.name } : {})} />;

  if (query.isLoading) {
    return (
      <Screen header={header} testID="order.skeleton">
        <Skeleton height={140} radius={theme.radius.xl} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton height={40} key={i} />
        ))}
      </Screen>
    );
  }
  if (query.isError && !order) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Screen header={header}>
        {notFound ? (
          <EmptyState actionLabel={t('pix.viewOrders')} onAction={() => router.replace('/orders' as never)} testID="order.not-found" text={t('order.notFoundText')} title={t('order.notFoundTitle')} />
        ) : (
          <ErrorState offline={!online} onRetry={() => void query.refetch()} retryLabel={t('common.tryAgain')} testID="order.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
        )}
      </Screen>
    );
  }
  if (!order) return <Screen header={header}>{null}</Screen>;

  const st = presentStatus(order.status);
  const allowed = new Set<string>(order.allowedActions);
  const onNotReceived = async () => {
    setNotReceivedOpen(false);
    try {
      await reportNotReceived(orderId);
      void haptic('success');
      toast.show(t('order.notReceivedDone'));
    } catch (e) {
      void haptic('error');
      toast.show(e instanceof ApiError && e.code === 'ORDER_NOT_REPORTABLE' ? t('order.notReceivedWindow') : t('order.notReceivedError'));
    }
  };
  const active = isActive(order.status);
  const phone = order.store.whatsapp;
  const message = t('order.whatsappMessage', { number: order.number });
  const talk = async (text = message) => {
    void haptic('selection');
    const ok = await openWhatsapp(phone, text);
    if (!ok) toast.show(phone ? t('order.whatsappFailed', { phone }) : t('order.whatsappFailed', { phone: '' }));
  };

  const onCancel = async () => {
    if (!online) {
      toast.show(t('order.cancelOffline'));
      return;
    }
    try {
      const done = await cancel.mutateAsync(undefined);
      void haptic('success');
      setCancelOpen(false);
      toast.show(done.payment.status === 'approved' || done.payment.status === 'refunded' ? t('order.cancelDone') : t('order.cancelDoneUnpaid'));
    } catch (error) {
      setCancelOpen(false);
      toast.show(error instanceof ApiError && error.code === 'ORDER_NOT_CANCELLABLE' ? t('order.cancelTooLate') : t('order.cancelFailed'));
      void query.refetch();
    }
  };

  const onReorder = async () => {
    const result = await reorderItems(order, cartParams).catch(() => null);
    if (!result || result.added === 0) toast.show(t('order.reorderFailed'));
    else if (result.missing.length > 0) toast.show(t('order.reorderPartial', { names: result.missing.join(', ') }));
    else router.push('/cart');
  };

  const eta = order.delivery ? `${order.delivery.etaMinMinutes} a ${order.delivery.etaMaxMinutes} min` : order.pickup ? `${order.pickup.prepMinMinutes} a ${order.pickup.prepMaxMinutes} min` : null;
  const hint =
    order.status === 'awaiting_payment'
      ? t('order.hintAwaiting')
      : order.status === 'received'
        ? t('order.hintReceived')
        : active && eta
          ? order.mode === 'pickup'
            ? t('order.hintPickup', { eta })
            : t('order.hintDelivery', { eta })
          : null;
  const paidMethod = order.payment.method === 'pix' ? t('order.paymentPix') : t('order.paymentCard');
  const updatedAt = query.dataUpdatedAt > 0 ? formatHour(new Date(query.dataUpdatedAt).toISOString()) : null;

  return (
    <Screen header={header} testID="order.screen">
      {!online ? <Banner testID="order.offline" text={`${t('order.offline')} ${updatedAt ? t('order.updatedAgo', { time: updatedAt }) : ''}`.trim()} tone="warning" /> : null}
      {order.status === 'awaiting_payment' ? (
        <Banner actionLabel={t('order.seePix')} onAction={() => router.push({ pathname: '/pay/[orderId]', params: { orderId } } as never)} testID="order.banner-pix" text={t('order.pixPending')} tone="warning" />
      ) : null}
      {active && (push === 'denied' || push === 'blocked') ? (
        <Banner actionLabel={t('confirmed.pushSettings')} onAction={() => void openNotificationSettings()} testID="order.banner-push" text={t('confirmed.pushBlocked')} tone="info" />
      ) : null}

      <View accessibilityLiveRegion="polite" style={styles.status} testID="order.status">
        <View style={styles.statusLines}>
          <SpeedLines color={theme.color.brand[300]} thickness={4} />
        </View>
        <Badge icon={st.icon} label={st.label} tone={st.tone} />
        <Text style={styles.onBrand} variant="title1">
          {st.label}
        </Text>
        {hint ? (
          <Text style={styles.onBrand} testID="order.hint">
            {hint}
          </Text>
        ) : null}
        {order.pickup?.code && order.status === 'ready_for_pickup' ? (
          <Text accessibilityLabel={t('confirmed.pickupCodeA11y', { code: spacedCode(order.pickup.code) })} style={styles.onBrand} testID="order.pickup-code" variant="numeral">
            {spacedCode(order.pickup.code)}
          </Text>
        ) : null}
        {order.tracking?.deliveryCode && order.status === 'out_for_delivery' ? (
          <Text style={styles.onBrand} testID="order.delivery-code" variant="bodyStrong">
            {`${t('order.deliveryCode')}: ${spacedCode(order.tracking.deliveryCode)}`}
          </Text>
        ) : null}
      </View>

      <StatusTimeline order={order} />

      <View style={styles.actions}>
        {allowed.has('contact_store') && phone ? <Button icon={<WhatsappLogo color={theme.color.text.brand} size={theme.size.iconMd} />} label={t('order.talkStore')} onPress={() => void talk()} size="lg" testID="order.whatsapp" variant="secondary" /> : null}
        {order.mode === 'pickup' && order.pickup && active ? <Button label={t('order.directions')} onPress={() => void openDirections(order.pickup?.address ?? '')} variant="secondary" /> : null}
        {allowed.has('rate') ? <Button icon={<Star color={theme.color.text.onBrand} size={theme.size.iconMd} weight="fill" />} label={t('order.rate')} onPress={() => router.push({ pathname: '/review/[orderId]', params: { orderId } } as never)} size="lg" testID="order.review" /> : null}
        {allowed.has('request_exchange') ? <Button icon={<ArrowsLeftRight color={theme.color.text.brand} size={theme.size.iconMd} />} label={t('order.requestExchange')} onPress={() => router.push({ pathname: '/exchange/new', params: { orderId } } as never)} testID="order.exchange" variant="secondary" /> : null}
        {order.status === 'delivered' || order.status === 'cancelled' || order.status === 'refused' || order.status === 'expired' ? <Button label={t('order.reorder')} onPress={() => void onReorder()} testID="order.reorder" variant="text" /> : null}
        {allowed.has('report_not_received') ? <Button label={t('order.notReceived')} onPress={() => setNotReceivedOpen(true)} testID="order.not-received" variant="text" /> : null}
        {allowed.has('cancel') ? <Button label={t('order.cancel')} onPress={() => setCancelOpen(true)} testID="order.cancel" variant="text" /> : null}
        {allowed.has('request_cancel') ? <Button label={t('order.requestCancel')} onPress={() => void talk(t('order.requestCancelMessage', { number: order.number }))} testID="order.request-cancel" variant="text" /> : null}
        {order.status === 'cancelled' || order.status === 'refused' || order.status === 'expired' ? <Button label={t('order.seeStores')} onPress={() => router.replace('/')} size="lg" testID="order.see-stores" /> : null}
      </View>

      <Button label={details ? t('order.hideDetails') : t('order.details')} onPress={() => setDetails((v) => !v)} testID="order.details-toggle" variant="text" />
      <Text color="secondary" style={styles.center}>{t('order.summaryLine', { count: itemCountLabel(order.items.reduce((n, i) => n + i.quantity, 0)), total: formatMoney(order.summary.total.amount) })}</Text>
      {details ? (
        <View style={styles.details} testID="order.details">
          <Text accessibilityRole="header" variant="title2">{t('order.items')}</Text>
          {order.items.map((item) => (
            <View key={item.variantId} style={styles.item}>
              <Text style={styles.flex}>{`${t('order.quantityTimes', { n: item.quantity })} ${item.name}${Object.values(item.attributes).length > 0 ? ` (${Object.values(item.attributes).join(', ')})` : ''}`}</Text>
              <Text>{formatMoney(item.lineTotal.amount)}</Text>
            </View>
          ))}
          {order.delivery ? (
            <>
              <Text accessibilityRole="header" variant="title2">{t('order.address')}</Text>
              <Text>{`${order.delivery.address.street}, ${order.delivery.address.number} · ${order.delivery.address.neighborhood}`}</Text>
            </>
          ) : order.pickup ? (
            <>
              <Text accessibilityRole="header" variant="title2">{t('order.pickupAt')}</Text>
              <Text>{order.pickup.address}</Text>
            </>
          ) : null}
          <Text accessibilityRole="header" variant="title2">{t('order.payment')}</Text>
          <Text>{paidMethod}</Text>
          <PriceSummary pickup={order.mode === 'pickup'} summary={{
            subtotalCents: order.summary.subtotal.amount,
            deliveryCents: order.summary.delivery.amount,
            deliveryEstimated: false,
            freeShipping: order.summary.freeShipping,
            serviceFeeCents: order.summary.serviceFee.amount,
            discountCents: order.summary.discount.amount,
            totalCents: order.summary.total.amount,
            minimumTotalApplied: false,
            missingForMinimumCents: null,
          }} />
          <Text color="secondary" variant="caption">{formatDateTime(order.createdAt)}</Text>
        </View>
      ) : null}

      <Dialog
        onClose={() => setNotReceivedOpen(false)}
        testID="order.not-received-dialog"
        text={t('order.notReceivedText')}
        title={t('order.notReceivedTitle')}
        visible={notReceivedOpen}
      >
        <Button label={t('order.notReceivedConfirm')} onPress={() => void onNotReceived()} testID="order.not-received-confirm" />
        <Button label={t('common.cancel')} onPress={() => setNotReceivedOpen(false)} variant="text" />
      </Dialog>
      <Dialog onClose={() => setCancelOpen(false)} testID="order.cancel-dialog" text={`${order.payment.status === 'approved' ? t('order.cancelPaid', { total: formatMoney(order.summary.total.amount) }) : t('order.cancelPix')}`} title={t('order.cancelTitle')} visible={cancelOpen}>
        <Button label={t('order.cancelKeep')} onPress={() => setCancelOpen(false)} />
        <Button label={t('order.cancel')} loading={cancel.isPending} onPress={() => void onCancel()} testID="order.cancel-confirm" variant="destructive" />
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { backgroundColor: theme.color.action.primary, borderRadius: theme.radius.hero, padding: theme.space[5], gap: theme.space[2], alignItems: 'flex-start', overflow: 'hidden' },
  statusLines: { opacity: 0.5, position: 'absolute', right: theme.space[4], top: theme.space[4] },
  onBrand: { color: theme.color.text.onBrand },
  actions: { gap: theme.space[2] },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  details: { gap: theme.space[2], backgroundColor: theme.color.surface.card, borderRadius: theme.radius.xl, padding: theme.space[4] },
  item: { flexDirection: 'row', gap: theme.space[2] },
});
