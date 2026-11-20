/**
 * Estados da corrida (RN-18, DEC-036d). Nomes em inglês no código, rótulos em pt-BR no app:
 * PRONTA_PARA_COLETA = `ready_for_collection`, AGUARDANDO_MOTOBOY = `awaiting_courier`, MOTOBOY_A_CAMINHO = `courier_en_route`,
 * SAIU_PARA_ENTREGA = `out_for_delivery`, ENTREGUE = `delivered`, NAO_ENTREGUE = `not_delivered`,
 * DEVOLVIDA_A_LOJA = `returned_to_store`, CANCELADA = `cancelled`.
 */
export const DELIVERY_STATUSES = ['ready_for_collection', 'awaiting_courier', 'courier_en_route', 'out_for_delivery', 'delivered', 'not_delivered', 'returned_to_store', 'cancelled'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** `delivery` = loja para cliente; `exchange_pickup` = coleta da troca (cliente para loja); `exchange_return` = reentrega da peça nova. */
export const DELIVERY_KINDS = ['delivery', 'exchange_pickup', 'exchange_return'] as const;
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

export const NOT_DELIVERED_REASONS = ['customer_absent', 'address_not_found', 'customer_refused', 'safety_risk', 'store_fault', 'other'] as const;
export type NotDeliveredReason = (typeof NOT_DELIVERED_REASONS)[number];

export const ACTIVE_STATUSES: readonly DeliveryStatus[] = ['ready_for_collection', 'awaiting_courier', 'courier_en_route', 'out_for_delivery', 'not_delivered'];
export const TERMINAL_STATUSES: readonly DeliveryStatus[] = ['delivered', 'returned_to_store', 'cancelled'];
/** Estados em que a corrida tem motoboy atribuído. */
export const WITH_COURIER: readonly DeliveryStatus[] = ['awaiting_courier', 'courier_en_route', 'out_for_delivery', 'not_delivered'];

const NEXT: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  ready_for_collection: ['awaiting_courier', 'cancelled'],
  awaiting_courier: ['courier_en_route', 'ready_for_collection', 'cancelled'], // voltar = reatribuir
  courier_en_route: ['out_for_delivery', 'ready_for_collection', 'cancelled'],
  out_for_delivery: ['delivered', 'not_delivered'],
  not_delivered: ['out_for_delivery', 'returned_to_store'], // reentrega ou devolução à loja
  delivered: [],
  returned_to_store: [],
  cancelled: [],
};

export const canMove = (from: DeliveryStatus, to: DeliveryStatus): boolean => NEXT[from].includes(to);
export const nextStatuses = (from: DeliveryStatus): readonly DeliveryStatus[] => NEXT[from];

/** Falha por culpa da loja entra no índice de cancelamento da loja (RN-08) e alerta o admin. */
export const isStoreFault = (reason: NotDeliveredReason): boolean => reason === 'store_fault';
