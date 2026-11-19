import type { CancelRequest, Order } from '@webag/shared';
import { formatHour } from './model';

/**
 * Estado de entrega mostrado no acompanhamento, derivado SÓ do que o contrato já expõe (`Order.delay`, `Order.cancelRequest`,
 * `Order.cancellation`). Função pura: o servidor decide (atraso, tolerância, quem pode cancelar); o app apenas escolhe o que mostrar
 * (docs/design/telas/onda-7-eta-atraso.md §3, BUG-015).
 */
export type DeliveryNotice =
  /** Passou do fim da faixa, antes da tolerância (E4). */
  | { kind: 'late'; passedMinutes: number; cancelFrom: string | null }
  /** Passou da tolerância, ainda na loja: cancelar na hora ou continuar esperando (E5). */
  | { kind: 'late-decide' }
  /** Passou da tolerância, com o motoboy: pedir cancelamento à operação (E5b). `respondWithinMin` = prazo de resposta da operação (`Order.delay.respondWithinMin`, F5), para a copy antes de pedir. */
  | { kind: 'late-out'; respondWithinMin: number | null }
  /** Pedido de cancelamento por atraso aberto na operação (E5b, enviado). */
  | { kind: 'late-request-pending'; respondBy: string }
  | { kind: 'late-request-approved' }
  | { kind: 'late-request-refused'; note: string | null }
  /** Cancelado pelo cliente por atraso (E6). */
  | { kind: 'cancelled-late' }
  /** Pedido de cancelamento em separação (BUG-015). */
  | { kind: 'cancel-pending'; respondBy: string; overdue: boolean }
  | { kind: 'cancel-approved'; by: CancelRequest['decidedBy'] }
  | { kind: 'cancel-refused'; note: string | null; by: CancelRequest['decidedBy'] };

const LATE_REASON = /atraso/i;

export function passedMinutes(toAtIso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(toAtIso)) / 60_000));
}

export function deliveryNotice(order: Order, now: number): DeliveryNotice | null {
  const cr = order.cancelRequest ?? null;
  if (order.status === 'cancelled') {
    if (order.cancellation?.by === 'customer' && LATE_REASON.test(order.cancellation.reason ?? '')) return { kind: 'cancelled-late' };
    if (cr?.status === 'approved') return { kind: 'cancel-approved', by: cr.decidedBy };
    return null;
  }
  const delay = order.delay ?? null;
  if (delay?.cancelRequest) {
    const r = delay.cancelRequest;
    if (r.status === 'pending') return { kind: 'late-request-pending', respondBy: formatHour(r.respondBy) };
    if (r.status === 'approved') return { kind: 'late-request-approved' };
    if (r.status === 'refused') return { kind: 'late-request-refused', note: r.decisionNote };
  }
  if (cr) {
    if (cr.status === 'pending') return { kind: 'cancel-pending', respondBy: formatHour(cr.respondBy), overdue: Date.parse(cr.respondBy) <= now };
    if (cr.status === 'refused') return { kind: 'cancel-refused', note: cr.decisionNote, by: cr.decidedBy };
  }
  if (delay?.canCancelWithoutCost) return delay.cancelMode === 'request' ? { kind: 'late-out', respondWithinMin: delay.respondWithinMin ?? null } : { kind: 'late-decide' };
  if (delay?.late) {
    const toAt = order.delivery?.eta?.toAt;
    return { kind: 'late', passedMinutes: toAt ? passedMinutes(toAt, now) : 0, cancelFrom: delay.cancelAvailableAt ? formatHour(delay.cancelAvailableAt) : null };
  }
  return null;
}

/** O pedido está atrasado (cabeçalho em modo "atrasado")? */
export const isLate = (order: Order): boolean => order.status !== 'cancelled' && order.status !== 'delivered' && (order.delay?.late ?? false);
