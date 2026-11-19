import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner } from '../../../src/components/Banner';
import { Button } from '../../../src/components/Button';
import { Skeleton } from '../../../src/components/Skeleton';
import { Text } from '../../../src/components/Text';
import { deliveryEta } from '../../../src/features/catalog/eta';
import { useOrder } from '../../../src/features/checkout/hooks';
import { Celebration } from '../../../src/features/orders/Celebration';
import { openDirections } from '../../../src/features/orders/links';
import { spacedCode } from '../../../src/features/orders/model';
import { enablePush, getPushStatus, openNotificationSettings, type PushStatus } from '../../../src/features/notifications/push';
import { t } from '../../../src/i18n';
import { Rise } from '../../../src/motion';
import { theme } from '../../../src/theme';

/**
 * S6. Pedido confirmado (WB-024 C2, 026, 190 C1; direção v3). Só se chega aqui depois que o SERVIDOR confirmou o pagamento.
 * O herói é QUANDO CHEGA (a faixa de horário, DEC-053), não o número do pedido. A permissão de aviso vira um interruptor dentro
 * do painel: aceite no contexto, sem folha por cima da celebração. Texto pequeno fica no painel noite (o branco sobre o roxo da marca
 * só passa AA em texto grande).
 */
export default function ConfirmedScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = String(orderId ?? '');
  const router = useRouter();
  const order = useOrder(id, { poll: false });
  const [push, setPush] = useState<PushStatus | 'on' | 'loading'>('loading');
  const [pushFailed, setPushFailed] = useState(false);

  useEffect(() => {
    void getPushStatus().then((s) => setPush(s === 'granted' ? 'on' : s));
  }, []);

  const goOrder = () => router.replace({ pathname: '/order/[id]', params: { id } } as never);
  const o = order.data;
  const window = o?.delivery ? deliveryEta({ etaMinMinutes: o.delivery.etaMinMinutes, etaMaxMinutes: o.delivery.etaMaxMinutes, eta: o.delivery.eta ?? null, available: true }, new Date(o.createdAt)) : null;

  const onToggle = async (next: boolean) => {
    if (!next) return;
    const result = await enablePush();
    if (result === 'granted') setPush('on');
    else {
      setPush(result);
      setPushFailed(true);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="confirmed.screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Celebration />
        <Rise index={0}>
          <Text accessibilityRole="header" style={styles.onBrand} testID="confirmed.title" variant="celebrate">
            {t('confirmed.title')}
          </Text>
        </Rise>
        {order.isLoading ? (
          <Skeleton height={56} radius={theme.radius.card} width="70%" />
        ) : o ? (
          <>
            {o.mode !== 'pickup' && window ? (
              <Rise index={1}>
                <View accessible accessibilityLabel={t('confirmed.estimate', { eta: `${window.start} e ${window.end}` })} testID="confirmed.estimate">
                  <Text allowFontScaling={false} style={styles.onBrand} variant="title2">
                    {t('confirmed.arrives')}
                  </Text>
                  <Text allowFontScaling={false} style={styles.onBrandBig} variant="priceXl">
                    {`${window.start} – ${window.end}`}
                  </Text>
                </View>
              </Rise>
            ) : null}
            <Rise index={2} style={styles.panelWrap}>
              <View style={styles.panel}>
                <Text style={styles.onInkMuted} testID="confirmed.order-number" variant="caption">
                  {t('confirmed.order', { number: o.number })}
                </Text>
                {o.mode === 'pickup' && o.pickup ? (
                  <>
                    {o.pickup.code ? (
                      <Text accessibilityLabel={t('confirmed.pickupCodeA11y', { code: spacedCode(o.pickup.code) })} style={styles.onInk} testID="confirmed.pickup-code" variant="priceXl">
                        {t('confirmed.pickupCode', { code: spacedCode(o.pickup.code) })}
                      </Text>
                    ) : null}
                    <Text style={styles.onInk}>{t('confirmed.pickupWhere', { address: o.pickup.address })}</Text>
                    <Button label={t('confirmed.directions')} onPress={() => void openDirections(o.pickup?.address ?? '')} testID="confirmed.directions" variant="onInk" />
                  </>
                ) : (
                  <Text style={styles.onInk}>{t('confirmed.sub')}</Text>
                )}

                {push === 'undetermined' || push === 'denied' || push === 'on' ? (
                  <View style={styles.switchRow} testID="confirmed.push">
                    <View style={styles.flex}>
                      <Text style={styles.onInk} variant="bodyStrong">
                        {t('confirmed.pushAsk')}
                      </Text>
                      <Text style={styles.onInkMuted} variant="caption">
                        {push === 'on' ? t('confirmed.pushOn') : t('confirmed.pushAskHint')}
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel={t('confirmed.pushEnable')}
                      ios_backgroundColor={theme.color.neutral[700]}
                      onValueChange={(v) => void onToggle(v)}
                      testID="confirmed.push-enable"
                      thumbColor={theme.color.neutral[0]}
                      trackColor={{ false: theme.color.neutral[500], true: theme.color.action.primary }}
                      value={push === 'on'}
                    />
                  </View>
                ) : null}
                {pushFailed ? <Banner text={t('confirmed.pushFailed')} tone="info" /> : null}
                {push === 'blocked' ? (
                  <View testID="confirmed.push-blocked" style={styles.blocked}>
                    <Text style={styles.onInk}>{t('confirmed.pushBlocked')}</Text>
                    <Button label={t('confirmed.pushSettings')} onPress={() => void openNotificationSettings()} variant="onInk" />
                  </View>
                ) : null}
              </View>
            </Rise>
          </>
        ) : (
          <>
            <Text style={styles.onBrandSmall}>{t('confirmed.errorText')}</Text>
            <Button label={t('confirmed.seeOrders')} onPress={() => router.replace('/orders' as never)} variant="onBrand" />
          </>
        )}

        <View style={styles.actions}>
          <Button label={t('confirmed.track')} onPress={goOrder} size="lg" testID="confirmed.track" variant="onBrand" />
          <Button label={t('confirmed.home')} onPress={() => router.replace('/')} testID="confirmed.home" variant="ink" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // marca #C02EF0: só texto grande em branco (4,29:1); o resto da informação vai no painel noite
  safe: { flex: 1, backgroundColor: theme.color.brand[500] },
  content: { flexGrow: 1, alignItems: 'flex-start', justifyContent: 'center', gap: theme.space[4], padding: theme.layout.screenPaddingX },
  onBrand: { color: theme.color.neutral[0] },
  onBrandBig: { color: theme.color.neutral[0] },
  onBrandSmall: { color: theme.color.neutral[900] },
  panelWrap: { alignSelf: 'stretch' },
  panel: { alignSelf: 'stretch', gap: theme.space[3], backgroundColor: theme.color.surface.ink, borderRadius: theme.radius.card, padding: theme.space[4] },
  onInk: { color: theme.color.text.onInk },
  onInkMuted: { color: theme.color.text.onInkMuted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: 56 },
  blocked: { gap: theme.space[2] },
  flex: { flex: 1 },
  actions: { alignSelf: 'stretch', gap: theme.space[2], marginTop: theme.space[2] },
});
