import type { Order } from '@webag/shared';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';
import { theme } from '../../theme';
import { SUPPORT_WHATSAPP } from '../checkout/config';
import type { DeliveryNotice } from './delivery-state';

export interface OrderNoticeProps {
  order: Order;
  notice: DeliveryNotice;
  /** O cliente escolheu "Continuar esperando" (só vale nesta tela; o direito de cancelar não some, D5). */
  waiting: boolean;
  busy: boolean;
  onWait: () => void;
  onCancelLate: () => void;
  onRequestCancelLate: () => void;
  onContact: () => void;
}

interface ShellProps {
  title: string;
  body: string;
  testID: string;
  children?: React.ReactNode;
}

/**
 * Cartão do acompanhamento para atraso, cancelamento por atraso e pedido de cancelamento em separação
 * (onda-7-eta-atraso.md §3.3 a §3.6, BUG-015). Texto sem "2 h"; devolução "na mesma forma de pagamento"; nenhuma promessa de
 * compensação (o contrato ainda não diz se existe nem de que tipo: docs/gestao/fila-mobile.md).
 */
export function OrderNotice({ order, notice, waiting, busy, onWait, onCancelLate, onRequestCancelLate, onContact }: OrderNoticeProps) {
  const total = formatMoney(order.summary.total.amount);
  const contact = SUPPORT_WHATSAPP ? <Button label={t('late.contact')} onPress={onContact} testID="tracking.late-contact" variant="secondary" /> : null;

  switch (notice.kind) {
    case 'late':
      return (
        <Shell body={notice.cancelFrom ? t('late.noticeBody', { hora: notice.cancelFrom }) : t('late.noticeBodyNoTime')} testID="tracking.late-banner" title={t('late.noticeTitle')}>
          {contact}
        </Shell>
      );
    case 'late-decide':
      return waiting ? (
        <Shell body={t('late.waitingBody')} testID="tracking.late-waiting" title={t('late.waitingTitle')}>
          <Button disabled={busy} label={t('late.cancel')} onPress={onCancelLate} testID="tracking.late-cancel" variant="text" />
        </Shell>
      ) : (
        <Shell body={t('late.decideBody', { total })} testID="tracking.late-decide" title={t('late.decideTitle')}>
          <Button disabled={busy} label={t('late.wait')} onPress={onWait} size="lg" testID="tracking.late-wait" variant="secondary" />
          <Button disabled={busy} label={t('late.cancel')} onPress={onCancelLate} size="lg" testID="tracking.late-cancel" variant="secondary" />
          {contact}
        </Shell>
      );
    case 'late-out':
      return waiting ? (
        <Shell body={t('late.waitingBody')} testID="tracking.late-waiting" title={t('late.waitingTitle')}>
          <Button disabled={busy} label={t('late.outRequest')} onPress={onRequestCancelLate} testID="tracking.late-request-cancel" variant="text" />
        </Shell>
      ) : (
        <Shell body={t('late.outBody')} testID="tracking.late-out" title={t('late.decideTitle')}>
          <Button disabled={busy} label={t('late.wait')} onPress={onWait} size="lg" testID="tracking.late-wait" variant="secondary" />
          <Button disabled={busy} label={t('late.outRequest')} onPress={onRequestCancelLate} size="lg" testID="tracking.late-request-cancel" variant="secondary" />
          {contact}
        </Shell>
      );
    case 'late-request-pending':
      return <Shell body={t('late.sentBody', { hora: notice.respondBy })} testID="tracking.late-request-sent" title={t('late.sentTitle')} />;
    case 'late-request-approved':
      return <Shell body={t('late.approvedBody', { total })} testID="tracking.late-request-approved" title={t('late.approvedTitle')} />;
    case 'late-request-refused':
      return <Shell body={[t('late.refusedBody'), notice.note ? t('cancelRequest.note', { text: notice.note }) : null].filter(Boolean).join(' ')} testID="tracking.late-request-refused" title={t('late.refusedTitle')} />;
    case 'cancelled-late':
      return <Shell body={t('late.cancelledBody', { total })} testID="tracking.late-cancelled" title={t('late.cancelledTitle')} />;
    case 'cancel-pending':
      return notice.overdue ? (
        <Shell body={t('cancelRequest.overdueBody')} testID="order.cancel-request-pending" title={t('cancelRequest.overdueTitle')} />
      ) : (
        <Shell body={t('cancelRequest.pendingBody', { hora: notice.respondBy })} testID="order.cancel-request-pending" title={t('cancelRequest.pendingTitle')} />
      );
    case 'cancel-approved':
      return <Shell body={t('cancelRequest.approvedBody')} testID="order.cancel-request-approved" title={t('cancelRequest.approvedTitle')} />;
    case 'cancel-refused':
      return <Shell body={[t('cancelRequest.refusedBody'), notice.note ? t('cancelRequest.note', { text: notice.note }) : null].filter(Boolean).join(' ')} testID="order.cancel-request-refused" title={t('cancelRequest.refusedTitle')} />;
  }
}

function Shell({ title, body, testID, children }: ShellProps) {
  return (
    <Card style={styles.card} testID={testID}>
      <View accessibilityLiveRegion="polite" accessible style={styles.text}>
        <Text variant="title2">{title}</Text>
        <Text color="secondary">{body}</Text>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.color.surface.sunken, gap: theme.space[3] },
  text: { gap: theme.space[1] },
});
