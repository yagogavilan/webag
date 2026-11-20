import type { AdminRespondLateCancelBody, CancelRequest, Courier, Delivery as ApiDelivery, DeliveryDetail as ApiDeliveryDetail, DeliveryStatus, GetLogisticsStats200 } from '@webag/shared';
import { apiRequest } from './client';

/** Logística do admin (Onda 4D, DEC-036): fila de coleta, motoboys, atribuição, status e custo. Operação e super admin despacham. */
export type { CancelRequest, Courier, DeliveryStatus, GetLogisticsStats200 as LogisticsStats };

/**
 * Corrida com a promessa de entrega (DEC-053). O contrato publica o FIM da faixa (`etaToAt`), o atraso calculado pelo servidor
 * (`overdue`, `overdueMinutes`) e a área do lote (`area`). O INÍCIO da faixa (`etaFromAt`) ainda não está no openapi.yaml (pendência P8):
 * sem ele a tela mostra "Prometido até 16:40" em vez de "Chega entre 15:40 e 16:40".
 */
interface EtaFields {
  etaFromAt?: string | null;
}
export type Delivery = ApiDelivery & EtaFields;
export type DeliveryKind = 'delivery' | 'exchange_pickup' | 'exchange_return';
export type DeliveryAction = 'assign' | 'confirm' | 'picked_up' | 'delivered' | 'not_delivered' | 'reattempt' | 'return_confirmed' | 'reassign' | 'cancel';
export type FailReason = 'customer_absent' | 'address_not_found' | 'customer_refused' | 'safety_risk' | 'store_fault' | 'other';
export type DeliveryDetail = ApiDeliveryDetail & EtaFields;

export interface DeliveryList {
  data: Delivery[];
  nextCursor: string | null;
}
export interface CourierList {
  data: Courier[];
  nextCursor: string | null;
}
export interface BatchResult {
  assigned: DeliveryDetail[];
  failed: { deliveryId: string; code: string }[];
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
  /** WB-262: a hora real da entrega (só `delivered`). Acima de 5 min de recuo o motivo é obrigatório; `other` exige a nota. */
  deliveredAt?: string;
  deliveredAtReason?: DeliveredAtReason;
  deliveredAtNote?: string;
}
export type DeliveredAtReason = 'courier_notified_late' | 'no_signal' | 'other';
export const DELIVERED_AT_REASONS: { id: DeliveredAtReason; label: string }[] = [
  { id: 'courier_notified_late', label: 'O motoboy avisou depois' },
  { id: 'no_signal', label: 'Ele ficou sem sinal' },
  { id: 'other', label: 'Outro motivo' },
];
/** Recuo da hora real da entrega: até 5 min sem motivo, até 60 min com motivo (WB-262). */
export const DELIVERED_AT_FREE_MIN = 5;
export const DELIVERED_AT_MAX_BACK_MIN = 60;

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
  revealContact: (id: string, reason: string) => apiRequest<{ contact: NonNullable<DeliveryDetail['contact']> }>(A, `${base}/deliveries/${id}/contact-reveal`, { method: 'POST', body: { reason } }),
  assignBatch: (body: { deliveryIds: string[]; courierId: string; addressConfirmed?: boolean }) => apiRequest<BatchResult>(A, `${base}/deliveries/assign-batch`, { method: 'POST', body, idempotencyKey: `batch-${[...body.deliveryIds].sort().join('').replace(/-/g, '').slice(0, 40)}-${body.courierId.slice(0, 8)}` }),
  /** Indicadores do dia ou do piloto (`logistics:report`: super admin, operação e financeiro; suporte recebe 403). */
  stats: (from: string, to: string) => apiRequest<GetLogisticsStats200>(A, `${base}/stats`, { query: { from, to } }),
  /** WB-255 C6: `arrive_soon` avisa o cliente que chega logo; `accept` aceita o cancelamento e a corrida volta à loja. */
  respondLateCancel: (orderId: string, body: AdminRespondLateCancelBody) => apiRequest<{ status?: string }>(A, `admin/orders/${orderId}/late-cancel/respond`, { method: 'POST', body }),
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
  stats: (day: string) => ['admin', 'logistics', 'stats', day] as const,
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

// ---- Promessa de entrega (DEC-053): faixa e alerta de atraso pelo FIM da faixa ---------------------------------------------------

const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "Chega entre 15:40 e 16:40" (faixa inteira) ou "Prometido até 16:40" (só o fim); nunca um horário solto sem dizer o que é. `null` sem ETA. */
export function etaBandText(delivery: Partial<Pick<Delivery, 'etaFromAt' | 'etaToAt'>>): string | null {
  if (!delivery.etaToAt) return null;
  const to = clock.format(new Date(delivery.etaToAt));
  return delivery.etaFromAt ? `Chega entre ${clock.format(new Date(delivery.etaFromAt))} e ${to}` : `Prometido até ${to}`;
}

export type EtaLevel = 'on_time' | 'ending' | 'late';
/** Minutos antes do fim da faixa em que o alerta "Perto do fim" aparece. */
export const ETA_ENDING_MIN = 10;
const FINISHED = ['delivered', 'not_delivered', 'returned_to_store', 'cancelled'];

/** `late` depois do fim da faixa (ou quando o servidor já marcou `overdue`); `ending` nos últimos 10 min; `null` sem faixa ou com a corrida encerrada. */
export function etaLevel(delivery: Pick<Delivery, 'status'> & { etaToAt?: string | null; overdue?: boolean }, now: number): EtaLevel | null {
  if (FINISHED.includes(delivery.status)) return null;
  if (!delivery.etaToAt) return delivery.overdue ? 'late' : null;
  const left = Date.parse(delivery.etaToAt) - now;
  if (left < 0 || delivery.overdue) return 'late';
  return left <= ETA_ENDING_MIN * 60_000 ? 'ending' : 'on_time';
}

/** "Atrasado há 12 min do fim da faixa", "Faltam 8 min para o fim da faixa" ou "No prazo". */
export function etaLevelText(delivery: Pick<Delivery, 'status'> & { etaToAt?: string | null; overdue?: boolean; overdueMinutes?: number | null }, now: number): string | null {
  const level = etaLevel(delivery, now);
  if (!level) return null;
  const computed = delivery.etaToAt ? Math.max(1, Math.round(Math.abs(Date.parse(delivery.etaToAt) - now) / 60_000)) : null;
  const minutes = level === 'late' ? (computed ?? delivery.overdueMinutes ?? null) : computed;
  if (level === 'late') return minutes ? `Atrasado há ${minutes} min do fim da faixa` : 'Atrasado em relação à faixa';
  if (level === 'ending') return `Faltam ${minutes} min para o fim da faixa`;
  return 'No prazo';
}

// ---- Lote por área ------------------------------------------------------------------------------------------------------------

/** Área da corrida para agrupar: a chave do servidor (`area.key`, bairro ou cidade) ou o "Bairro, Cidade" do destino. Coleta/entrega de troca não entram no lote. */
export function areaOf(delivery: Pick<Delivery, 'kind' | 'area' | 'destination'>): string | null {
  if (delivery.kind !== 'delivery') return null;
  const raw = (delivery.area?.key ?? delivery.destination ?? '').trim();
  return raw ? raw.toLocaleLowerCase('pt-BR') : null;
}

export interface AreaBatch {
  area: string;
  label: string;
  rows: Delivery[];
}
/** Tamanho máximo do lote no contrato (`maxItems` de `assign-batch`; o parâmetro `entrega_lote_max` do admin pode ser menor). */
export const BATCH_HARD_MAX = 10;
/** Áreas com 2 ou mais corridas esperando (o operador pode atribuir o mesmo motoboy a todas). Maior lote primeiro. */
export function batchesOf(rows: Delivery[]): AreaBatch[] {
  const groups = new Map<string, Delivery[]>();
  for (const row of rows) {
    const area = areaOf(row);
    if (area) groups.set(area, [...(groups.get(area) ?? []), row]);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([area, list]) => ({ area, label: list[0]!.destination ?? area, rows: list }))
    .sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label, 'pt-BR'));
}

/** Fila: atrasado pela faixa primeiro (quando há), depois o nível de espera, depois o mais antigo. */
export function sortQueueByEta(rows: Delivery[], now: number): Delivery[] {
  const etaRank = (row: Delivery) => ({ late: 0, ending: 1, on_time: 2 })[etaLevel(row, now) ?? 'on_time'];
  const rank = { late: 0, warning: 1, normal: 2 } as const;
  return [...rows].sort((a, b) => etaRank(a) - etaRank(b) || rank[waitLevel(a)] - rank[waitLevel(b)] || Date.parse(a.readyAt) - Date.parse(b.readyAt));
}

/** Pedido de cancelamento por atraso ainda sem resposta (a faixa "Responda em 06:58" da Logística). */
export function pendingLateCancel(delivery: Pick<Delivery, 'lateCancelRequest'>): CancelRequest | null {
  const request = delivery.lateCancelRequest;
  return request && request.status === 'pending' ? request : null;
}

/** "mm:ss" que faltam para `respondBy`; zero ou negativo vira "00:00" (o sistema aceita sozinho). */
export function countdownText(respondBy: string, now: number): string {
  const left = Math.max(0, Math.round((Date.parse(respondBy) - now) / 1000));
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}

const brasiliaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Dia civil de Brasília (AAAA-MM-DD), o mesmo de `from`/`to` dos indicadores. */
export function brasiliaToday(now: number): string {
  return brasiliaDay.format(new Date(now));
}

/**
 * Corridas com alerta de atraso (`lateAlertedAt`, uma vez por corrida no servidor). Na primeira leitura (`seen` nulo) só memoriza: o som
 * não toca por alerta que já estava lá quando a tela abriu. Depois, toca para cada corrida que ganhou o alerta.
 */
export function lateAlertsSince(seen: ReadonlySet<string> | null, rows: Pick<Delivery, 'id' | 'lateAlertedAt'>[]): { ids: Set<string>; fresh: string[] } {
  const ids = new Set(rows.filter((row) => row.lateAlertedAt).map((row) => row.id));
  return { ids, fresh: seen === null ? [] : [...ids].filter((id) => !seen.has(id)) };
}
