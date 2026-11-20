import { StyleSheet, View } from 'react-native';
import type { Order } from '@webag/shared';
import { Text } from '../../components/Text';
import { Check, X } from '../../components/icons';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { failureNode, formatHour, timelineSteps, type StepState } from './model';

const STATE_KEY = { done: 'order.stepDone', current: 'order.stepCurrent', upcoming: 'order.stepUpcoming', failed: 'order.stepFailed' } as const;

/**
 * Linha do tempo (spec S7): recebido, aceito, em separação, aguardando motoboy, saiu para entrega, entregue. Cada nó lê
 * "Passo 2 de 6, Pedido aceito, concluído às 14:32" (a11y); estado nunca só por cor (check, anel e texto). Pedido encerrado sem
 * entrega termina num nó vermelho com X, quem e por quê.
 */
export function StatusTimeline({ order }: { order: Pick<Order, 'status' | 'mode' | 'timeline' | 'cancellation'> }) {
  const steps = timelineSteps(order);
  const failure = failureNode(order);
  return (
    <View accessibilityLabel={t('order.timeline')} style={styles.wrap} testID="order.timeline">
      {steps.map((step, index) => {
        const last = index === steps.length - 1 && !failure;
        const stateText = step.state === 'done' ? (step.at ? t('order.stepDone', { time: formatHour(step.at) }) : t('order.stepDoneNoTime')) : t(STATE_KEY[step.state]);
        return (
          <View
            accessible
            accessibilityLabel={t('order.stepA11y', { n: index + 1, total: steps.length, label: step.label, state: stateText })}
            key={step.status}
            style={styles.row}
            testID={`order.step-${index + 1}`}
          >
            <View style={styles.rail}>
              <Node state={step.state} />
              {!last ? <View style={[styles.line, step.state === 'done' && styles.lineDone]} /> : null}
            </View>
            <View style={styles.texts}>
              <Text color={step.state === 'upcoming' ? 'secondary' : 'primary'} variant={step.state === 'current' ? 'bodyStrong' : 'body'}>
                {step.label}
              </Text>
              {step.at ? (
                <Text color="secondary" variant="caption">
                  {formatHour(step.at)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {failure ? (
        <View accessible accessibilityLabel={[failure.label, failure.by, failure.reason].filter(Boolean).join(', ')} style={styles.row} testID="order.failure">
          <View style={styles.rail}>
            <Node state="failed" />
          </View>
          <View style={styles.texts}>
            <Text color="danger" variant="bodyStrong">
              {failure.label}
            </Text>
            {failure.by ? <Text color="secondary" variant="caption">{t('order.cancelledBy', { who: failure.by })}</Text> : null}
            {failure.reason ? <Text color="secondary" variant="caption">{t('order.reason', { reason: failure.reason })}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Node({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <View style={[styles.node, styles.nodeDone]}>
        <Check color={theme.color.text.onBrand} size={14} weight="bold" />
      </View>
    );
  }
  if (state === 'failed') {
    return (
      <View style={[styles.node, styles.nodeFailed]}>
        <X color={theme.color.text.onBrand} size={14} weight="bold" />
      </View>
    );
  }
  if (state === 'current') return <View style={[styles.node, styles.nodeCurrent]} />;
  return <View style={[styles.node, styles.nodeUpcoming]} />;
}

const NODE = 24;
const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', gap: theme.space[3], minHeight: 56 },
  rail: { alignItems: 'center', width: NODE },
  line: { flex: 1, width: 3, borderRadius: 2, backgroundColor: theme.color.border.default, marginVertical: 2 },
  lineDone: { backgroundColor: theme.color.action.primary },
  texts: { flex: 1, paddingBottom: theme.space[3] },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center' },
  nodeDone: { backgroundColor: theme.color.action.primary },
  nodeFailed: { backgroundColor: theme.color.feedback.danger.base },
  nodeCurrent: { borderWidth: 6, borderColor: theme.color.action.primary, backgroundColor: theme.color.neutral[0] },
  nodeUpcoming: { borderWidth: 2, borderColor: theme.color.border.strong, backgroundColor: theme.color.neutral[0] },
});
