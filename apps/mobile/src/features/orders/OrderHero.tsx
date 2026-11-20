import type { Order, OrderStatus } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { EtapaACaminho, EtapaEntregue, EtapaSeparando } from '../../art/kit.generated';
import { BarsProgress } from '../../art/Bars';
import { Warning } from '../../components/icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { deliveryEta } from '../catalog/eta';
import { useNow } from '../../lib/useNow';
import { isLate, passedMinutes } from './delivery-state';
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
export function OrderHero({ order, hint, refund = null }: { order: Order; hint: string | null; refund?: string | null }) {
  const now = useNow();
  const st = presentStatus(order.status);
  // U8.6: cancelamento aceito (pela operação por atraso, ou pela loja em separação) com o pedido ainda não encerrado: o título é "Cancelamento
  // aceito", sem faixa de horário, sem etapa e sem barra. Pendente e recusado seguem com a entrega em andamento (o aviso abaixo explica).
  const delayAccepted = order.delay?.cancelRequest?.status === 'approved';
  const accepted = order.status !== 'cancelled' && order.status !== 'delivered' && (delayAccepted || order.cancelRequest?.status === 'approved');
  const step = accepted ? 0 : stepOf(order.status);
  const active = step > 0 && order.status !== 'delivered';
  const window = order.delivery && active ? deliveryEta({ etaMinMinutes: order.delivery.etaMinMinutes, etaMaxMinutes: order.delivery.etaMaxMinutes, eta: order.delivery.eta ?? null, available: true }, new Date(order.createdAt)) : null;
  const Art = order.status === 'out_for_delivery' ? EtapaACaminho : step >= 5 || order.status === 'ready_for_pickup' ? EtapaEntregue : EtapaSeparando;
  const code = !accepted && order.tracking?.deliveryCode && order.status === 'out_for_delivery' ? order.tracking.deliveryCode : null;
  const late = !accepted && isLate(order) && window !== null;
  const passed = late && order.delivery?.eta ? passedMinutes(order.delivery.eta.toAt, now) : 0;
  const stepLabel = step > 0 ? t('order.stepOf', { n: step, total: STEPS.length, name: STEP_NAMES[step - 1] ?? st.label }) : st.label;
  // O texto de apoio (motoboy devolvendo, estorno) vem do aviso abaixo no cancelamento por atraso; na loja, o texto curto do estorno
  const heroTitle = accepted ? t('cancelRequest.approvedTitle') : late ? t('late.title') : st.label;
  const heroHint = accepted ? (delayAccepted ? null : t('cancelRequest.approvedBody')) : hint;

  return (
    <View accessibilityLiveRegion="polite" style={styles.hero} testID="order.status">
      <View pointerEvents="none" style={styles.art}>
        <Art width={150} />
      </View>
      {accepted ? null : (
        <Text style={styles.step} variant="captionStrong">
          {stepLabel}
        </Text>
      )}
      {late ? (
        // Atraso não depende só de cor: ícone + palavra (onda-7-eta-atraso.md D9)
        <View accessible accessibilityLabel={t('late.tag')} style={styles.lateTag} testID="order.late-tag">
          <Warning color={theme.color.accent.base} size={theme.size.iconSm} weight="fill" />
          <Text style={styles.lateTagText} variant="captionStrong">
            {t('late.tag').toUpperCase()}
          </Text>
        </View>
      ) : null}
      <Text style={styles.title} variant={longWord(heroTitle) ? 'title1' : 'display'}>
        {heroTitle}
      </Text>
      {refund ? (
        <View accessible accessibilityLabel={`${t('late.refundLabel')} ${refund}`} testID="tracking.refund">
          <Text allowFontScaling={false} style={styles.etaCaption} variant="caption">
            {t('late.refundLabel')}
          </Text>
          <Text allowFontScaling={false} style={styles.eta} variant="priceXl">
            {refund}
          </Text>
        </View>
      ) : null}
      {window ? (
        <View accessible accessibilityLabel={t('order.arrivesBetween', { start: window.start, end: window.end })} testID="order.eta">
          <Text allowFontScaling={false} style={styles.etaCaption} variant="caption">
            {late ? t('late.expected') : t('confirmed.arrives')}
          </Text>
          <Text allowFontScaling={false} style={late ? styles.etaLate : styles.eta} variant={late ? 'title1' : 'priceXl'}>
            {`${window.start} – ${window.end}`}
          </Text>
        </View>
      ) : null}
      {late ? (
        // O contador de minutos não é anunciado ao leitor de tela (a mudança para "atrasado" já é, uma vez, pela região viva do cartão)
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.lateText} testID="order.late-passed" variant="bodyStrong">
          {passed > 0 ? t('late.passed', { n: passed }) : t('late.passedNow')}
        </Text>
      ) : null}
      {heroHint ? (
        <Text style={styles.hint} testID="order.hint">
          {heroHint}
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

/** Palavra comprida ("Cancelamento") não cabe ao lado da arte no título grande: usa o título menor em vez de quebrar no meio da palavra. */
const longWord = (text: string): boolean => text.split(' ').some((word) => word.length > 10);

const styles = StyleSheet.create({
  hero: { backgroundColor: theme.color.surface.ink, borderRadius: theme.radius.card, padding: theme.space[5], gap: theme.space[2], overflow: 'hidden' },
  art: { position: 'absolute', right: -16, top: -8, opacity: 1 },
  step: { color: theme.color.accent.base },
  title: { color: theme.color.neutral[0], maxWidth: '70%' },
  etaCaption: { color: theme.color.text.onInkMuted },
  eta: { color: theme.color.neutral[0] },
  etaLate: { color: theme.color.neutral[300] },
  lateText: { color: theme.color.neutral[0] },
  lateTag: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1] },
  lateTagText: { color: theme.color.neutral[0] },
  hint: { color: theme.color.text.onInkMuted },
  codeBox: { gap: theme.space[2], paddingTop: theme.space[2] },
  blocks: { flexDirection: 'row', gap: theme.space[2] },
  block: { width: 52, height: 64, borderRadius: 14, backgroundColor: theme.color.accent.base, alignItems: 'center', justifyContent: 'center' },
  blockText: { color: theme.color.accent.onBase },
  progress: { paddingTop: theme.space[3] },
});
