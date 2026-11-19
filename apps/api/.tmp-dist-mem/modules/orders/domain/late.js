/**
 * Atraso da entrega Webag (RN-19 item 4, WB-253): o pedido passou do FIM da faixa prometida (`etaToAt`, ancorada no pagamento).
 * Função pura; o servidor decide, o app só mostra (funciona também sem conexão ao reconectar).
 */
export const LATE_TRACKED_STATUSES = ['received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery'];
/** Antes da saída o cancelamento por atraso é imediato; em saída vira pedido à operação. */
export const LATE_IMMEDIATE_CANCEL_STATUSES = ['received', 'accepted', 'in_preparation', 'ready_for_collection'];
export function lateStateOf(order, toleranceMin, now) {
    const none = { late: false, canCancelWithoutCost: false, cancelAvailableAt: null, cancelMode: null };
    if (order.mode !== 'delivery' || !order.etaToAt || !LATE_TRACKED_STATUSES.includes(order.status))
        return none;
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
export function deservesCompensation(order, deliveredAt, toleranceMin) {
    return order.mode === 'delivery' && order.etaToAt !== null && deliveredAt.getTime() > order.etaToAt.getTime() + toleranceMin * 60_000;
}
/**
 * SEC-177: motivos de "não entregue" atribuíveis ao cliente/endereço. Corrida que passou por um deles não gera compensação por atraso,
 * mesmo entregue depois (reentrega): o atraso não foi da Webag. [HIPÓTESE: RN-19 4c a ajustar pelo PO; ver `fila-backend-dev.md`.]
 */
export const CUSTOMER_FAULT_REASONS = ['customer_absent', 'address_not_found', 'customer_refused'];
export const isCustomerFault = (reason) => CUSTOMER_FAULT_REASONS.includes(reason ?? '');
/** Cupom pessoal da compensação; `null` quando o tipo é `nenhuma` ou o valor do `cupom_valor` é zero. */
export function compensationCoupon(kind, valueCents) {
    if (kind === 'frete_gratis_proximo')
        return { kind: 'free_shipping', value: 0 };
    if (kind === 'cupom_valor' && valueCents >= 1)
        return { kind: 'fixed', value: valueCents };
    return null;
}
export const COMPENSATION_VALID_DAYS = 30;
//# sourceMappingURL=late.js.map