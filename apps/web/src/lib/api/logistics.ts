import type { Courier, Delivery, DeliveryDetail, DeliveryStatus } from '@webag/shared';
import { apiRequest } from './client';

/** Logística do admin (Onda 4D, DEC-036): fila de coleta, motoboys, atribuição, status e custo. Operação e super admin despacham. */
export type { Courier, Delivery, DeliveryDetail, DeliveryStatus };
export type DeliveryKind = 'delivery' | 'exchange_pickup' | 'exchange_return';
export type DeliveryAction = 'assign' | 'confirm' | 'picked_up' | 'delivered' | 'not_delivered' | 'reattempt' | 'return_confirmed' | 'reassign' | 'cancel';
export type FailReason = 'customer_absent' | 'address_not_found' | 'customer_refused' | 'safety_risk' | 'store_fault' | 'other';

export interface DeliveryList {
  data: Delivery[];
  nextCursor: string | null;
}
export interface CourierList {
  data: Courier[];
  nextCursor: string | null;
}
export interface WhatsappMessage {
  courierPhone: string;
  message: string;
  link: string;
  courierActiveDeliveries: number;
}
export interface StatusBody {
  action: DeliveryAction;
  reason?: string;
  code?: string;
  failReason?: FailReason;
  overrideReason?: string;
}

const A = 'admin' as const;
const base = 'admin/logistics';

export const logisticsApi = {
  deliveries: (query: { tab?: 'active' | 'done'; status?: string; kind?: DeliveryKind; courierId?: string; limit?: number; cursor?: string } = {}) => apiRequest<DeliveryList>(A, `${base}/deliveries`, { query: { ...query } }),
  delivery: (id: string) => apiRequest<DeliveryDetail>(A, `${base}/deliveries/${id}`),
  assign: (id: string, body: { courierId: string; addressConfirmed?: boolean }) => apiRequest<DeliveryDetail>(A, `${base}/deliveries/${id}/assign`, { method: 'POST', body, idempotencyKey: `assign-${id}-${body.courierId}` }),
  whatsapp: (id: string) => apiRequest<WhatsappMessage>(A, `${base}/deliveries/${id}/whatsapp`),
  whatsappSent: (id: string) => apiRequest<void>(A, `${base}/deliveries/${id}/whatsapp-sent`, { method: 'POST' }),
  status: (id: string, body: StatusBody) => apiRequest<DeliveryDetail>(A, `${base}/deliveries/${id}/status`, { method: 'POST', body }),
  setCost: (id: string, body: { costCents: number; reason?: string }) => apiRequest<Delivery>(A, `${base}/deliveries/${id}/cost`, { method: 'PUT', body }),
  couriers: (query: { q?: string; active?: boolean; limit?: number } = {}) => apiRequest<CourierList>(A, `${base}/couriers`, { query: { q: query.q, active: query.active === undefined ? undefined : String(query.active), limit: query.limit } }),
  createCourier: (body: { name: string; phone: string; note?: string | null; documentsChecked: boolean }) => apiRequest<Courier>(A, `${base}/couriers`, { method: 'POST', body }),
  updateCourier: (id: string, body: { name?: string; phone?: string; note?: string | null; active?: boolean }) => apiRequest<Courier>(A, `${base}/couriers/${id}`, { method: 'PATCH', body }),
};

export const logisticsKeys = {
  all: ['admin', 'logistics'] as const,
  queue: ['admin', 'logistics', 'deliveries', 'active'] as const,
  done: ['admin', 'logistics', 'deliveries', 'done'] as const,
  detail: (id: string) => ['admin', 'logistics', 'delivery', id] as const,
  couriers: ['admin', 'logistics', 'couriers'] as const,
};

export const KIND_LABEL: Record<DeliveryKind, string> = { delivery: 'Entrega', exchange_pickup: 'Coleta de troca', exchange_return: 'Troca ida e volta' };

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  ready_for_collection: 'Pronto para coleta',
  awaiting_courier: 'Aguardando motoboy',
  courier_en_route: 'Motoboy a caminho da loja',
  out_for_delivery: 'Coletado, a caminho do cliente',
  delivered: 'Entregue',
  not_delivered: 'Não entregue',
  returned_to_store: 'Devolvido à loja',
  cancelled: 'Cancelado',
};

export const FAIL_REASONS: { id: FailReason; label: string }[] = [
  { id: 'customer_absent', label: 'Cliente ausente' },
  { id: 'address_not_found', label: 'Endereço não encontrado' },
  { id: 'customer_refused', label: 'Cliente recusou receber' },
  { id: 'store_fault', label: 'Pedido não estava pronto na loja' },
  { id: 'safety_risk', label: 'Problema com o motoboy' },
  { id: 'other', label: 'Outro' },
];

export type WaitLevel = 'normal' | 'warning' | 'late';
/** Nível do WaitChip (onda-4d §0.4): até 9 min normal, 10 a 19 atenção, 20 ou mais atrasado. O servidor manda `sla`; aqui só o rótulo. */
export function waitLevel(delivery: Pick<Delivery, 'sla' | 'waitingMinutes'>): WaitLevel {
  if (delivery.sla === 'late') return 'late';
  if (delivery.sla === 'long') return 'warning';
  const minutes = delivery.waitingMinutes ?? 0;
  return minutes >= 20 ? 'late' : minutes >= 10 ? 'warning' : 'normal';
}

export function waitText(delivery: Pick<Delivery, 'sla' | 'waitingMinutes'>): string {
  const minutes = delivery.waitingMinutes ?? 0;
  return waitLevel(delivery) === 'late' ? `Atrasado · ${minutes} min` : `Esperando há ${minutes} min`;
}

/** Fila: atrasado, atenção, normal; dentro de cada nível, o mais antigo primeiro. */
export function sortQueue(rows: Delivery[]): Delivery[] {
  const rank = { late: 0, warning: 1, normal: 2 } as const;
  return [...rows].sort((a, b) => rank[waitLevel(a)] - rank[waitLevel(b)] || Date.parse(a.readyAt) - Date.parse(b.readyAt));
}
