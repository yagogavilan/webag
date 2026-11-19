import type { Order, OrderStatus } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { EtapaACaminho, EtapaEntregue, EtapaSeparando } from '../../art/kit.generated';
import { BarsProgress } from '../../art/Bars';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { deliveryEta, readEta } from '../catalog/eta';
import { presentStatus, spacedCode } from './model';

const STEPS = ['received', 'accepted', 'in_preparation', 'out_for_delivery', 'delivered'] as const;

/** Etapa de 1 a 5 para o progresso (0 = sem progresso: aguardando pagamento ou encerrado sem entrega). */
export function stepOf(status: OrderStatus): number {
  switch (status) {
    case 'received':
      return 1;
    case 'accepted':
      return 2;
    case 'in_preparation':
    case 'ready_for_collection':
      return 3;
    case 'out_for_delivery':
    case 'ready_for_pickup':
      return 4;
    case 'delivered':
      return 5;
    default:
      return 0;
  }
}

const STEP_NAMES = ['Pedido recebido', 'Confirmado', 'Em separação', 'A caminho', 'Entregue'] as const;

/**
 * Cabeçalho do acompanhamento (direção v3 §5): bloco noite com a ilustração da etapa, a etapa em 34, a FAIXA de chegada em 54
 * (DEC-053: faixa gravada no pedido, nunca número único), o progresso de 5 segmentos inclinados com "Etapa N de 5 · nome" e,
 * a caminho, o código de entrega em blocos. "Pedido aceito" aparece uma vez.
 */
export function OrderHero({ order, hint }: { order: Order; hint: string | null }) {
  const st = presentStatus(order.status);
  const step = stepOf(order.status);
  const active = step > 0 && order.status !== 'delivered';
  const window = order.delivery && active ? deliveryEta({ etaMinMinutes: order.delivery.etaMinMinutes, etaMaxMinutes: order.delivery.etaMaxMinutes, eta: readEta(order.delivery), available: true }, new Date(order.createdAt)) : null;
  const Art = order.status === 'out_for_delivery' ? EtapaACaminho : step >= 5 || order.status === 'ready_for_pickup' ? EtapaEntregue : EtapaSeparando;
  const code = order.tracking?.deliveryCode && order.status === 'out_for_delivery' ? order.tracking.deliveryCode : null;
  const stepLabel = step > 0 ? t('order.stepOf', { n: step, total: STEPS.length, name: STEP_NAMES[step - 1] ?? st.label }) : st.label;

  return (
    <View accessibilityLiveRegion="polite" style={styles.hero} testID="order.status">
      <View pointerEvents="none" style={styles.art}>
        <Art width={150} />
      </View>
      <Text style={styles.step} variant="captionStrong">
        {stepLabel}
      </Text>
      <Text style={styles.title} variant="display">
        {st.label}
      </Text>
      {window ? (
        <View accessible accessibilityLabel={t('order.arrivesBetween', { start: window.start, end: window.end })} testID="order.eta">
          <Text allowFontScaling={false} style={styles.etaCaption} variant="caption">
            {t('confirmed.arrives')}
          </Text>
          <Text allowFontScaling={false} style={styles.eta} variant="priceXl">
            {`${window.start} – ${window.end}`}
          </Text>
        </View>
      ) : null}
      {hint ? (
        <Text style={styles.hint} testID="order.hint">
          {hint}
        </Text>
      ) : null}
      {order.pickup?.code && order.status === 'ready_for_pickup' ? (
        <Text accessibilityLabel={t('confirmed.pickupCodeA11y', { code: spacedCode(order.pickup.code) })} style={styles.title} testID="order.pickup-code" variant="priceXl">
          {spacedCode(order.pickup.code)}
        </Text>
      ) : null}
      {code ? (
        <View accessible accessibilityLabel={`${t('order.deliveryCode')}: ${spacedCode(code)}`} style={styles.codeBox} testID="order.delivery-code">
          <Text style={styles.hint} variant="captionStrong">
            {t('order.deliveryCode')}
          </Text>
          <View style={styles.blocks}>
            {code.split('').map((c, i) => (
              <View key={i} style={styles.block}>
                <Text allowFontScaling={false} style={styles.blockText} variant="display">
                  {c}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint} variant="caption">
            {t('order.deliveryCodeHint')}
          </Text>
        </View>
      ) : null}
      {step > 0 ? (
        <View style={styles.progress}>
          <BarsProgress step={step} total={STEPS.length} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: theme.color.surface.ink, borderRadius: theme.radius.card, padding: theme.space[5], gap: theme.space[2], overflow: 'hidden' },
  art: { position: 'absolute', right: -16, top: -8, opacity: 1 },
  step: { color: theme.color.accent.base },
  title: { color: theme.color.neutral[0], maxWidth: '70%' },
  etaCaption: { color: theme.color.text.onInkMuted },
  eta: { color: theme.color.neutral[0] },
  hint: { color: theme.color.text.onInkMuted },
  codeBox: { gap: theme.space[2], paddingTop: theme.space[2] },
  blocks: { flexDirection: 'row', gap: theme.space[2] },
  block: { width: 52, height: 64, borderRadius: 14, backgroundColor: theme.color.accent.base, alignItems: 'center', justifyContent: 'center' },
  blockText: { color: theme.color.accent.onBase },
  progress: { paddingTop: theme.space[3] },
});
