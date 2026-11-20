import type { Order } from '@webag/shared';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';

/**
 * Estorno do pedido (WB-259, DEC-065 F3): `Order.refund { amountCents, method, status, deadlineText }`, do contrato. O app mostra valor,
 * status e o prazo em TEXTO da API (`deadlineText`, fixo por meio, sem data prometida; RN-08). A API usa `completed` (a RN-08 escreve
 * `done`: DEC-068 manteve `completed`). `completed` quer dizer concluído do lado da Webag: o prazo do banco continua valendo, por isso
 * o texto de prazo aparece nos dois estados. Textos de prazo `[HIPÓTESE; HIP-P09]`: jurídico (J16) revisa no servidor antes do G5.
 */
export type Refund = NonNullable<Order['refund']>;

export const refundOf = (order: Pick<Order, 'refund'>): Refund | null => order.refund ?? null;

export interface RefundText {
  title: string;
  status: string;
  body: string;
  /** Uma frase só, para o leitor de tela (valor, meio e status juntos). */
  a11y: string;
}

export function refundText(refund: Refund): RefundText {
  const title = t('refund.title', { value: formatMoney(refund.amountCents) });
  const status = refund.status === 'completed' ? t('refund.statusDone') : t('refund.statusProcessing');
  const body = refund.deadlineText;
  return { title, status, body, a11y: `${title}, ${status}. ${body}` };
}
