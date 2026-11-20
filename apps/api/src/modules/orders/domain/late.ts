import type { OrderMode, OrderStatus } from './state.js';

/**
 * Atraso da entrega Webag (RN-19 item 4, WB-253): o pedido passou do FIM da faixa prometida (`etaToAt`, ancorada no pagamento).
 * Função pura; o servidor decide, o app só mostra (funciona também sem conexão ao reconectar).
 */
export const LATE_TRACKED_STATUSES: readonly OrderStatus[] = ['received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery'];
/** Antes da saída o cancelamento por atraso é imediato; em saída vira pedido à operação. */
export const LATE_IMMEDIATE_CANCEL_STATUSES: readonly OrderStatus[] = ['received', 'accepted', 'in_preparation', 'ready_for_collection'];

export interface LateState {
  /** Passou do fim da faixa (aviso, 1 push). */
  late: boolean;
  /** Passou do fim da faixa + tolerância: "Cancelar sem custo" (ou "Pedir cancelamento" em saída). */
  canCancelWithoutCost: boolean;
  /** Quando o cancelamento sem custo passa a valer (fim da faixa + tolerância); nulo sem faixa gravada. */
  cancelAvailableAt: Date | null;
  /** `immediate` antes da saída; `request` em saída (a operação responde em `entrega_cancel_resposta_min`). */
  cancelMode: 'immediate' | 'request' | null;
}

export function lateStateOf(order: { mode: OrderMode; status: OrderStatus; etaToAt: Date | null }, toleranceMin: number, now: Date): LateState {
  const none: LateState = { late: false, canCancelWithoutCost: false, cancelAvailableAt: null, cancelMode: null };
  if (order.mode !== 'delivery' || !order.etaToAt || !LATE_TRACKED_STATUSES.includes(order.status)) return none;
  const cancelAvailableAt = new Date(order.etaToAt.getTime() + toleranceMin * 60_000);
  const canCancelWithoutCost = now.getTime() >= cancelAvailableAt.getTime();
  return {
    late: now.getTime() > order.etaToAt.getTime(),
    canCancelWithoutCost,
    cancelAvailableAt,
    cancelMode: canCancelWithoutCost ? (order.status === 'out_for_delivery' ? 'request' : 'immediate') : null,
  };
}

/** Pedido ENTREGUE com atraso além da tolerância gera compensação (RN-19 4c). */
export function deservesCompensation(order: { mode: OrderMode; etaToAt: Date | null }, deliveredAt: Date, toleranceMin: number): boolean {
  return order.mode === 'delivery' && order.etaToAt !== null && deliveredAt.getTime() > order.etaToAt.getTime() + toleranceMin * 60_000;
}

/**
 * SEC-177: motivos de "não entregue" atribuíveis ao cliente/endereço. Corrida que passou por um deles não gera compensação por atraso,
 * mesmo entregue depois (reentrega): o atraso não foi da Webag. DEC-064 (a) / DEC-076 (A-05): `address_not_found` NÃO compensa; a exceção "salvo se a operação corrigir a causa" não existe no código (DT-072, sem a ação de correção a regra é conservadora: sem compensação, cortesia por cupom da plataforma).
 */
export const CUSTOMER_FAULT_REASONS = ['customer_absent', 'address_not_found', 'customer_refused'] as const;
export const isCustomerFault = (reason: string | null | undefined): boolean => (CUSTOMER_FAULT_REASONS as readonly string[]).includes(reason ?? '');

export type CompensationKind = 'frete_gratis_proximo' | 'cupom_valor' | 'nenhuma';

/** Cupom pessoal da compensação; `null` quando o tipo é `nenhuma` ou o valor do `cupom_valor` é zero. */
export function compensationCoupon(kind: CompensationKind, valueCents: number): { kind: 'free_shipping' | 'fixed'; value: number } | null {
  if (kind === 'frete_gratis_proximo') return { kind: 'free_shipping', value: 0 };
  if (kind === 'cupom_valor' && valueCents >= 1) return { kind: 'fixed', value: valueCents };
  return null;
}

export const COMPENSATION_VALID_DAYS = 30;
