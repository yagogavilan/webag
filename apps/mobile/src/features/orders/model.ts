import type { Order, OrderStatus, OrderSummary } from '@webag/shared';
import type { BadgeTone } from '../../components/Badge';
import {
  CheckCircle,
  Clock,
  Hourglass,
  Package,
  Storefront,
  Truck,
  XCircle,
  type IconComponent,
} from '../../components/icons';
import { t, type MessageKey } from '../../i18n';

/** Rótulo, selo e ícone de cada estado do pedido (RN-07, onda-4 §0.2). O estado nunca é só cor: sempre ícone + texto. */
export interface StatusPresentation {
  label: string;
  tone: BadgeTone;
  icon: IconComponent;
}

const PRESENTATION: Record<OrderStatus, { key: MessageKey; tone: BadgeTone; icon: IconComponent }> = {
  awaiting_payment: { key: 'orders.status.awaiting_payment', tone: 'warning', icon: Clock },
  received: { key: 'orders.status.received', tone: 'info', icon: Hourglass },
  accepted: { key: 'orders.status.accepted', tone: 'info', icon: CheckCircle },
  in_preparation: { key: 'orders.status.in_preparation', tone: 'info', icon: Package },
  out_for_delivery: { key: 'orders.status.out_for_delivery', tone: 'info', icon: Truck },
  ready_for_pickup: { key: 'orders.status.ready_for_pickup', tone: 'success', icon: Storefront },
  delivered: { key: 'orders.status.delivered', tone: 'success', icon: CheckCircle },
  cancelled: { key: 'orders.status.cancelled', tone: 'danger', icon: XCircle },
  refused: { key: 'orders.status.refused', tone: 'danger', icon: XCircle },
  expired: { key: 'orders.status.expired', tone: 'neutral', icon: Clock },
};

export function presentStatus(status: OrderStatus): StatusPresentation {
  const p = PRESENTATION[status];
  return { label: t(p.key), tone: p.tone, icon: p.icon };
}

export const ACTIVE_STATUSES: readonly OrderStatus[] = ['awaiting_payment', 'received', 'accepted', 'in_preparation', 'out_for_delivery', 'ready_for_pickup'];
export const FAILED_STATUSES: readonly OrderStatus[] = ['cancelled', 'refused', 'expired'];

export const isActive = (status: OrderStatus): boolean => ACTIVE_STATUSES.includes(status);
export const isFailed = (status: OrderStatus): boolean => FAILED_STATUSES.includes(status);

/** Estado em que o pagamento ainda pode ser feito. */
export const isAwaitingPayment = (order: Pick<Order, 'status'>): boolean => order.status === 'awaiting_payment';

export type StepState = 'done' | 'current' | 'upcoming' | 'failed';

export interface TimelineStep {
  /** Estado do pedido que este passo representa. */
  status: OrderStatus;
  label: string;
  state: StepState;
  /** ISO da hora em que o passo aconteceu (do histórico do servidor). */
  at: string | null;
}

/** Os 5 passos da spec S7. Entrega: "Saiu para entrega"; retirada: "Pronto para retirada". */
export function timelineSteps(order: Pick<Order, 'status' | 'mode' | 'timeline'>): TimelineStep[] {
  const fourth: OrderStatus = order.mode === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery';
  const path: OrderStatus[] = ['received', 'accepted', 'in_preparation', fourth, 'delivered'];
  const labels: Record<string, MessageKey> = {
    received: 'orders.step.received',
    accepted: 'orders.step.accepted',
    in_preparation: 'orders.step.in_preparation',
    out_for_delivery: 'orders.step.out_for_delivery',
    ready_for_pickup: 'orders.step.ready_for_pickup',
    delivered: 'orders.step.delivered',
  };
  const at = (s: OrderStatus): string | null => order.timeline.find((e) => e.status === s)?.at ?? null;
  const failed = isFailed(order.status);
  // Pedido que nunca foi pago (vencido, ou cancelado antes de pagar) não mostra passos concluídos que não aconteceram.
  const lastReached = failed ? Math.max(-1, ...path.map((s, i) => (at(s) ? i : -1))) : path.indexOf(order.status);
  return path.map((status, index) => {
    let state: StepState;
    if (failed) state = index <= lastReached ? 'done' : 'upcoming';
    else if (order.status === 'awaiting_payment') state = 'upcoming';
    else if (order.status === 'delivered' || index < lastReached) state = 'done';
    else if (index === lastReached) state = 'current';
    else state = 'upcoming';
    return { status, label: t(labels[status] as MessageKey), state, at: at(status) };
  });
}

/** Pedido encerrado sem entrega: o último nó vira "Cancelado/Recusado/Vencido" com motivo e quem (spec S7). */
export function failureNode(order: Pick<Order, 'status' | 'cancellation' | 'timeline'>): { label: string; by: string | null; reason: string | null; at: string | null } | null {
  if (!isFailed(order.status)) return null;
  const entry = [...order.timeline].reverse().find((e) => e.status === order.status);
  const by = order.cancellation?.by ?? entry?.actor ?? null;
  return {
    label: presentStatus(order.status).label,
    by: by ? t(`orders.by.${by}` as MessageKey) : null,
    reason: order.cancellation?.reason ?? entry?.reason ?? null,
    at: order.cancellation?.at ?? entry?.at ?? null,
  };
}

/** "18 nov, 14:32". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
  return `${d.getDate()} ${month}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const formatHour = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const itemCountLabel = (n: number): string => (n === 1 ? t('orders.itemOne') : t('orders.itemMany', { n }));

/** Linha da lista: loja, status, data e total lidos como uma frase (a11y, spec S8). */
export function summaryA11y(order: OrderSummary): string {
  return [order.store.name, presentStatus(order.status).label, formatDateTime(order.createdAt), itemCountLabel(order.itemCount)].join(', ');
}

/** "4 8 2 1": o código de retirada é lido dígito a dígito. */
export const spacedCode = (code: string): string => code.split('').join(' ');

/** WhatsApp: só dígitos; 10 ou 11 dígitos recebem o 55 do Brasil. Inválido = null (o botão some, spec S7 Permissão). */
export function whatsappUrl(raw: string | null | undefined, message: string): string | null {
  const digits = (raw ?? '').replace(/\D+/g, '');
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (full.length < 12 || full.length > 15) return null;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

/** "Como chegar": abre o mapa do aparelho (o app não embute mapa, ADR). Endereço vai só na busca, sem coordenadas. */
export const mapsUrl = (address: string): string => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
