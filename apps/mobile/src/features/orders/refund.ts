import { z } from 'zod';
import { t } from '../../i18n';
import { formatMoney } from '../../lib/format';

/**
 * Estorno do pedido (WB-259, DEC-065 F3). Contrato PROPOSTO: `Order.refund { amountCents, method, status }`. O campo ainda não está no
 * `openapi.yaml`; este leitor valida o que vier (qualquer forma inesperada = sem seção) e some quando o tipo gerado passar a trazê-lo.
 * O app mostra valor, meio e status da API e o texto de prazo por MEIO, sem data prometida (`expectedBy` é fase 2).
 * Textos de prazo: `[HIPÓTESE; HIP-P09]`, passam pelo jurídico antes do G5 (J16).
 */
export const refundSchema = z.object({
  amountCents: z.number().int().nonnegative(),
  method: z.enum(['pix', 'card']),
  status: z.enum(['processing', 'completed']),
});
export type Refund = z.infer<typeof refundSchema>;

/** Lê `refund` de um pedido (ou de qualquer objeto da API) sem depender de o tipo gerado já ter o campo. */
export function readRefund(source: unknown): Refund | null {
  const parsed = refundSchema.safeParse((source as { refund?: unknown } | null | undefined)?.refund);
  return parsed.success ? parsed.data : null;
}

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
  const body = refund.status === 'completed' ? t('refund.bodyDone') : refund.method === 'pix' ? t('refund.bodyPix') : t('refund.bodyCard');
  return { title, status, body, a11y: `${title}, ${status}. ${body}` };
}
