import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ApiError } from '../../../src/api/problem';
import { placeExchange } from '../../../src/api/exchanges-api';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { Header } from '../../../src/components/Header';
import { CheckCircle, Clock, Info } from '../../../src/components/icons';
import { RadioListItem } from '../../../src/components/RadioListItem';
import { Screen } from '../../../src/components/Screen';
import { Skeleton } from '../../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../../src/components/StateViews';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { useOrder } from '../../../src/features/checkout/hooks';
import { useExchangeOptions } from '../../../src/features/exchanges/hooks';
import {
  REASON_ORDER,
  buildExchangeRequest,
  firstMissing,
  formatDay,
  reasonState,
  type ExchangeDraft,
  type ReasonId,
} from '../../../src/features/exchanges/model';
import { PhotoPicker, type Photo } from '../../../src/features/exchanges/PhotoPicker';
import { openWhatsapp } from '../../../src/features/orders/links';
import { t, type MessageKey } from '../../../src/i18n';
import { formatMoney } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

const REASON_KEYS: Record<ReasonId, { title: MessageKey; hint: MessageKey }> = {
  size: { title: 'exchange.reasonSize', hint: 'exchange.reasonSizeHint' },
  color: { title: 'exchange.reasonColor', hint: 'exchange.reasonColorHint' },
  defect: { title: 'exchange.reasonDefect', hint: 'exchange.reasonDefectHint' },
  regret: { title: 'exchange.reasonRegret', hint: 'exchange.reasonRegretHint' },
};

/**
 * X1b. Pedir troca em uma tela, sem digitar: motivo, peça nova, como devolver e enviar (DEC-037). Nada é cobrado agora: a taxa de
 * coleta (e a diferença de preço) só aparece depois que a loja aprovar, com valor fechado pelo servidor. Prazos vêm do servidor.
 */
export default function NewExchangeScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = String(orderId ?? '');
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const options = useExchangeOptions(id);
  const order = useOrder(id, { poll: false });
  const [reason, setReason] = useState<ReasonId | null>(null);
  const [newVariantId, setNewVariantId] = useState<string | null>(null);
  const [prefer, setPrefer] = useState<'replace' | 'refund'>('replace');
  const [method, setMethod] = useState<'drop_at_store' | 'pickup_at_home'>('drop_at_store');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [note, setNote] = useState('');
  const [explain, setExplain] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ id: string; number: string; when: string; regret: boolean } | null>(null);
  const key = useRef<{ fingerprint: string; key: string } | null>(null);

  const header = <Header title={t('exchange.title')} />;
  const item = options.data?.items[0];

  if (options.isLoading || order.isLoading) {
    return (
      <Screen header={header} testID="exchange.skeleton">
        <Skeleton height={56} />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton height={72} key={i} radius={theme.radius.lg} />
        ))}
      </Screen>
    );
  }
  if (options.isError || !options.data || !item) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={() => void options.refetch()} retryLabel={t('common.tryAgain')} testID="exchange.error" text={online ? t('states.errorText') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  if (!options.data.deliveredAt) {
    return (
      <Screen header={header}>
        <EmptyState icon={Clock} testID="exchange.not-delivered" text={t('exchange.notDeliveredText')} title={t('exchange.notDeliveredTitle')} />
      </Screen>
    );
  }

  const states = Object.fromEntries(REASON_ORDER.map((r) => [r, reasonState(item, r)])) as Record<ReasonId, ReturnType<typeof reasonState>>;
  const anyEligible = REASON_ORDER.some((r) => states[r].eligible);
  if (!anyEligible) {
    const phone = order.data?.store.whatsapp ?? null;
    return (
      <Screen header={header}>
        <EmptyState
          {...(phone ? { actionLabel: t('order.talkStore'), onAction: () => void openWhatsapp(phone, t('order.whatsappMessage', { number: order.data?.number ?? '' })) } : {})}
          icon={Clock}
          testID="exchange.expired"
          text={t('exchange.expiredText')}
          title={t('exchange.expiredTitle')}
        />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen header={<Header onBack={() => router.replace('/orders' as never)} title={t('exchange.title')} />} testID="exchange.success">
        <View accessibilityLiveRegion="polite" style={styles.success}>
          <CheckCircle color={theme.color.feedback.success.base} size={theme.size.iconEmpty} weight="fill" />
          <Text style={styles.center} variant="title1">{t('exchange.successTitle')}</Text>
          <Text color="secondary" style={styles.center}>{done.regret ? t('exchange.successRegret', { number: done.number }) : t('exchange.successText', { number: done.number, when: done.when })}</Text>
          <Button label={t('exchange.successTrack')} onPress={() => router.replace({ pathname: '/exchange/[id]', params: { id: done.id } } as never)} size="lg" testID="exchange.success-track" />
          <Button label={t('exchange.successOrders')} onPress={() => router.replace('/orders' as never)} variant="text" />
        </View>
      </Screen>
    );
  }

  const variants = (item.variants ?? []).filter((v) => !v.current);
  const swapAvailable = variants.some((v) => v.available);
  const needsSwap = reason === 'size' || reason === 'color';
  const state = reason ? states[reason] : null;
  const feeCents = state?.pickupFeeCents ?? 0;
  const itemLabel = `${item.name ?? ''}${Object.values(item.attributes ?? {}).length ? ` · ${Object.values(item.attributes ?? {}).join(' · ')}` : ''}`;
  const target = variants.find((v) => v.variantId === newVariantId);
  const from = Object.values(item.attributes ?? {})[0] ?? '';
  const to = Object.values(target?.attributes ?? {})[0] ?? '';
  const refundOnly = reason === 'regret' || (reason === 'defect' && prefer === 'refund') || (needsSwap && !swapAvailable);
  const summary = refundOnly ? t('exchange.summaryRefund') : t('exchange.summarySwap', { from, to: to || '…' });

  const draft = (): ExchangeDraft => ({ orderItemId: item.orderItemId ?? '', reason: reason as ReasonId, newVariantId, prefer, method, photoIds: photos.flatMap((p) => (p.id ? [p.id] : [])), note });

  const onSubmit = async () => {
    setSendError(null);
    const missing = firstMissing({ reason, newVariantId, photoIds: photos.filter((p) => p.id).map((p) => p.id as string) }, swapAvailable);
    if (missing) {
      void haptic('error');
      setSectionError(missing.message);
      return;
    }
    setSectionError(null);
    if (photos.some((p) => p.status === 'uploading')) return;
    if (!online) {
      setSendError(t('exchange.errOffline'));
      return;
    }
    const body = buildExchangeRequest(draft());
    const fingerprint = JSON.stringify(body);
    key.current = key.current && key.current.fingerprint === fingerprint ? key.current : { fingerprint, key: Crypto.randomUUID() };
    setSending(true);
    try {
      const created = await placeExchange(id, body, key.current.key);
      void haptic('success');
      key.current = null;
      setDone({ id: created.id, number: created.number, when: new Date(created.answerDeadlineAt).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''), regret: created.type === 'withdrawal' });
    } catch (error) {
      void haptic('error');
      if (error instanceof ApiError && error.code === 'EXCHANGE_NO_STOCK') setSendError(t('exchange.errNoStock'));
      else if (error instanceof ApiError && error.code === 'EXCHANGE_ALREADY_OPEN') setSendError(t('exchange.errOpen'));
      else if (error instanceof ApiError && error.code?.startsWith('EXCHANGE_')) setSendError(error.detail ?? t('exchange.errSend'));
      else {
        setSendError(t('exchange.errSend'));
        toast.show(t('exchange.errSend'));
      }
    } finally {
      setSending(false);
    }
  };

  const footer = (
    <View accessibilityLiveRegion="polite" style={styles.footer} testID="exchange.summary">
      {reason ? <Text variant="bodyStrong">{summary}</Text> : null}
      <Text color="secondary" testID="exchange.pay-today" variant="caption">{t('exchange.payToday')}</Text>
      {sectionError ? <Text color="danger" testID="exchange.section-error" variant="captionStrong">{sectionError}</Text> : null}
      {sendError ? <Banner text={sendError} tone="danger" /> : null}
      <Button label={sending ? t('exchange.submitting') : refundOnly && reason ? t('exchange.submitRefund') : t('exchange.submit')} loading={sending} onPress={() => void onSubmit()} size="lg" testID="exchange.submit" />
    </View>
  );

  return (
    <Screen footer={footer} header={header} testID="exchange.screen">
      <Text color="secondary" variant="caption">{t('exchange.context', { number: order.data?.number ?? '', store: order.data?.store.name ?? '' })}</Text>
      {states.size.deadline ? <Banner testID="exchange.deadline-banner" text={t('exchange.deadlineBanner', { date: formatDay(states.size.deadline) })} tone="info" /> : null}

      <Text accessibilityRole="header" variant="title2">{t('exchange.item')}</Text>
      <View style={styles.card} testID={`exchange.item-${item.orderItemId}`}>
        <Text variant="bodyStrong">{itemLabel}</Text>
      </View>

      <Text accessibilityRole="header" variant="title2">{t('exchange.reason')}</Text>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {REASON_ORDER.map((r) => {
          const s = states[r];
          const date = s.deadline ? formatDay(s.deadline) : '';
          const k = REASON_KEYS[r];
          return (
            <View key={r} style={!s.eligible && styles.inert}>
              <RadioListItem
                onPress={() => {
                  if (!s.eligible) {
                    setExplain(s.blocked);
                    return;
                  }
                  setExplain(null);
                  setReason(r);
                  setSectionError(null);
                  if (r === 'regret') setMethod('drop_at_store');
                }}
                selected={reason === r}
                subtitle={s.eligible ? t(k.hint, { date }) : (s.blocked ?? '')}
                testID={`exchange.reason-${r === 'regret' ? 'regret' : r}`}
                title={t(k.title)}
              />
            </View>
          );
        })}
      </View>
      {explain ? <Banner testID="exchange.reason-info" text={explain} tone="info" /> : null}

      {needsSwap ? (
        <View style={styles.group} testID="exchange.swap">
          <Text accessibilityRole="header" variant="title2">{t('exchange.swapTitle')}</Text>
          {swapAvailable ? (
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {variants.map((v) => {
                const label = Object.values(v.attributes ?? {}).join(' · ');
                const selected = newVariantId === v.variantId;
                return (
                  <Pressable
                    accessibilityLabel={v.available ? label : t('exchange.swapA11yNoStock', { label })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: !v.available }}
                    key={v.variantId}
                    onPress={() => v.available && (setNewVariantId(v.variantId ?? null), setSectionError(null), void haptic('selection'))}
                    style={[styles.chip, selected && styles.chipOn, !v.available && styles.chipOff]}
                    testID={`exchange.swap-${v.variantId}`}
                  >
                    <Text color={selected ? 'onBrand' : 'primary'} style={!v.available && styles.strike} variant="bodyStrong">{label}</Text>
                    {!v.available ? <Text color="secondary" variant="micro">{t('exchange.swapNoStock')}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Banner testID="exchange.swap-none-refund" text={t('exchange.swapNone')} tone="warning" />
          )}
          {swapAvailable ? <Text color="secondary" variant="caption">{t('exchange.swapReserve')}</Text> : null}
          <View style={styles.diff} testID="exchange.price-diff"><Info color={theme.color.text.secondary} size={theme.size.iconSm} /><Text color="secondary" style={styles.flex} variant="caption">{t('exchange.priceDiffNote')}</Text></View>
        </View>
      ) : null}

      {reason === 'defect' ? (
        <View style={styles.group}>
          <PhotoPicker onChange={setPhotos} photos={photos} />
          <Text accessibilityRole="header" variant="bodyStrong">{t('exchange.preferTitle')}</Text>
          <RadioListItem onPress={() => setPrefer('replace')} selected={prefer === 'replace'} testID="exchange.defect-prefer-swap" title={t('exchange.preferSwap')} />
          <RadioListItem onPress={() => setPrefer('refund')} selected={prefer === 'refund'} testID="exchange.defect-prefer-refund" title={t('exchange.preferRefund')} />
          <NoteField onChange={setNote} value={note} />
        </View>
      ) : null}
      {reason === 'regret' ? <Text color="secondary">{t('exchange.regretText')}</Text> : null}

      {reason ? (
        <View style={styles.group}>
          <Text accessibilityRole="header" variant="title2">{t('exchange.returnTitle')}</Text>
          <RadioListItem onPress={() => setMethod('drop_at_store')} selected={method === 'drop_at_store'} subtitle={`${t('exchange.returnStoreFree')} · ${order.data?.pickup?.address ?? order.data?.store.name ?? ''}`} testID="exchange.return-store" title={t('exchange.returnStore')} />
          <View style={!options.data.pickupAvailable && styles.inert}>
            <RadioListItem
              onPress={() => (options.data.pickupAvailable ? setMethod('pickup_at_home') : setExplain(t('exchange.returnPickupOff')))}
              selected={method === 'pickup_at_home'}
              subtitle={!options.data.pickupAvailable ? t('exchange.returnPickupOff') : reason === 'size' || reason === 'color' ? (feeCents > 0 ? t('exchange.returnPickupFee', { fee: formatMoney(feeCents) }) : t('exchange.returnPickupFree')) : t('exchange.returnPickupFree')}
              testID="exchange.return-pickup"
              title={t('exchange.returnPickup')}
            />
          </View>
          {method === 'pickup_at_home' && feeCents > 0 && (reason === 'size' || reason === 'color') ? <Banner testID="exchange.fee-notice" text={t('exchange.feeNotice', { fee: formatMoney(feeCents) })} tone="info" /> : null}
          {method === 'pickup_at_home' ? <Text color="secondary" variant="caption">{t('exchange.returnPickupHint')}</Text> : null}
        </View>
      ) : null}
      {reason && reason !== 'defect' ? <NoteField onChange={setNote} value={note} /> : null}
    </Screen>
  );
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.noteBox}>
      <Text color="secondary" variant="captionStrong">{t('exchange.note')}</Text>
      <TextInput accessibilityLabel={t('exchange.note')} maxLength={300} multiline onChangeText={onChange} style={styles.note} testID="exchange.note" value={value} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: theme.space[2] },
  card: { backgroundColor: theme.color.surface.card, borderRadius: theme.radius.lg, padding: theme.space[3], borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.subtle },
  inert: { opacity: theme.opacity.disabled },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] },
  chip: { minHeight: theme.size.touchMin, minWidth: theme.size.touchMin, paddingHorizontal: theme.space[4], borderRadius: theme.radius.pill, borderWidth: theme.borderWidth.strong, borderColor: theme.color.border.default, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface.card },
  chipOn: { backgroundColor: theme.color.action.primary, borderColor: theme.color.action.primary },
  chipOff: { opacity: theme.opacity.disabled },
  strike: { textDecorationLine: 'line-through' },
  diff: { flexDirection: 'row', gap: theme.space[2], alignItems: 'flex-start' },
  flex: { flex: 1 },
  noteBox: { gap: theme.space[1] },
  note: { minHeight: 80, borderWidth: theme.borderWidth.hairline, borderColor: theme.color.border.default, borderRadius: theme.radius.control, padding: theme.space[3], textAlignVertical: 'top', color: theme.color.text.primary, backgroundColor: theme.color.surface.card, ...theme.text.body },
  footer: { gap: theme.space[1] },
  success: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[4], paddingVertical: theme.space[10] },
  center: { textAlign: 'center' },
});
