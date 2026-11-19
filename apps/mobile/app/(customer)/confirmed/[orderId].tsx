import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { Skeleton } from '../../../src/components/Skeleton';
import { SpeedLines } from '../../../src/components/SpeedLines';
import { Text } from '../../../src/components/Text';
import { useOrder } from '../../../src/features/checkout/hooks';
import { Celebration } from '../../../src/features/orders/Celebration';
import { openDirections } from '../../../src/features/orders/links';
import { spacedCode } from '../../../src/features/orders/model';
import { enablePush, getPushStatus, openNotificationSettings, type PushStatus } from '../../../src/features/notifications/push';
import { t } from '../../../src/i18n';
import { haptic } from '../../../src/lib/haptics';
import { theme } from '../../../src/theme';

/**
 * S6. Pedido confirmado (WB-024 C2, 026, 190 C1). Só se chega aqui depois que o SERVIDOR confirmou o pagamento (PIX ou cartão).
 * Zona de celebração: a tela inunda na cor de marca, com a manchete e o selo animado (estático com "reduzir movimento").
 */
export default function ConfirmedScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = String(orderId ?? '');
  const router = useRouter();
  const order = useOrder(id, { poll: false });
  const [push, setPush] = useState<PushStatus | 'dismissed' | 'on' | 'loading'>('loading');
  const [pushFailed, setPushFailed] = useState(false);

  useEffect(() => {
    void haptic('success');
    void getPushStatus().then((s) => setPush(s === 'granted' ? 'on' : s));
  }, []);

  const goOrder = () => router.replace({ pathname: '/order/[id]', params: { id } } as never);
  const o = order.data;
  const eta = o?.delivery ? t('confirmed.etaRange', { min: o.delivery.etaMinMinutes, max: o.delivery.etaMaxMinutes }) : null;

  const onEnable = async () => {
    const result = await enablePush();
    if (result === 'granted') {
      setPush('on');
      void haptic('success');
    } else {
      setPush(result);
      setPushFailed(true);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="confirmed.screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.lines}>
          <SpeedLines color={theme.color.brand[300]} thickness={6} />
        </View>
        <Celebration />
        <Text accessibilityRole="header" style={styles.onBrand} testID="confirmed.title" variant="title1">
          {t('confirmed.title')}
        </Text>
        {order.isLoading ? (
          <Skeleton height={24} width="50%" />
        ) : o ? (
          <>
            <Text style={styles.onBrand} testID="confirmed.order-number" variant="numeralBrand">
              {t('confirmed.order', { number: o.number })}
            </Text>
            {o.mode === 'pickup' && o.pickup ? (
              <View style={styles.card}>
                {o.pickup.code ? (
                  <Text accessibilityLabel={t('confirmed.pickupCodeA11y', { code: spacedCode(o.pickup.code) })} testID="confirmed.pickup-code" variant="numeral">
                    {t('confirmed.pickupCode', { code: spacedCode(o.pickup.code) })}
                  </Text>
                ) : null}
                <Text>{t('confirmed.pickupWhere', { address: o.pickup.address })}</Text>
                <Button label={t('confirmed.directions')} onPress={() => void openDirections(o.pickup?.address ?? '')} testID="confirmed.directions" variant="secondary" />
              </View>
            ) : eta ? (
              <Text style={styles.onBrand} testID="confirmed.estimate" variant="title2">
                {t('confirmed.estimate', { eta })}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.onBrand}>{t('confirmed.errorText')}</Text>
            <Button label={t('confirmed.seeOrders')} onPress={() => router.replace('/orders' as never)} variant="onBrand" />
          </>
        )}

        {push === 'undetermined' || push === 'denied' ? (
          <View style={styles.card} testID="confirmed.push">
            <Text>{t('confirmed.pushAsk')}</Text>
            {pushFailed ? <Banner text={t('confirmed.pushFailed')} tone="info" /> : null}
            <Button label={t('confirmed.pushEnable')} onPress={() => void onEnable()} testID="confirmed.push-enable" variant="secondary" />
            <Button label={t('confirmed.pushLater')} onPress={() => setPush('dismissed')} testID="confirmed.push-dismiss" variant="text" />
          </View>
        ) : null}
        {push === 'blocked' ? (
          <View style={styles.card} testID="confirmed.push-blocked">
            <Text>{t('confirmed.pushBlocked')}</Text>
            <Button label={t('confirmed.pushSettings')} onPress={() => void openNotificationSettings()} variant="secondary" />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button label={t('confirmed.track')} onPress={goOrder} size="lg" testID="confirmed.track" variant="onBrand" />
          <Button label={t('confirmed.home')} onPress={() => router.replace('/')} testID="confirmed.home" variant="onBrandText" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // action.primary (6:1 com branco): todo texto sobre a inundação passa AA, não só o grande.
  safe: { flex: 1, backgroundColor: theme.color.action.primary },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[4], padding: theme.layout.screenPaddingX },
  lines: { alignSelf: 'flex-start', opacity: 0.6 },
  onBrand: { color: theme.color.text.onBrand, textAlign: 'center' },
  card: { alignSelf: 'stretch', gap: theme.space[3], backgroundColor: theme.color.neutral[0], borderRadius: theme.radius.xl, padding: theme.space[4] },
  actions: { alignSelf: 'stretch', gap: theme.space[2], marginTop: theme.space[2] },
});
