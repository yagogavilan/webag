/**
 * Máquina de estados do pedido (RN-07), explícita e validada no servidor. Toda transição grava evento (de, para, ator,
 * motivo). Não há retrocesso; correção administrativa é cancelamento com motivo (auditado).
 */
export const ORDER_STATUSES = ['awaiting_payment', 'received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'cancelled', 'refused', 'expired'];
export const TERMINAL_STATUSES = ['delivered', 'cancelled', 'refused', 'expired'];
/** `scope=active` da lista do cliente: de `awaiting_payment` a `ready_for_pickup`. */
export const ACTIVE_STATUSES = ['awaiting_payment', 'received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup'];
/** Estados em que há dinheiro pago a devolver se o pedido for encerrado sem entrega. */
export const PAID_STATUSES = ['received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup', 'delivered'];
const RULES = {
    awaiting_payment: [
        { to: 'received', actors: ['system'] }, // pagamento aprovado (webhook/conciliação)
        { to: 'expired', actors: ['system'] },
        { to: 'cancelled', actors: ['customer', 'system', 'admin'] },
    ],
    received: [
        { to: 'accepted', actors: ['store', 'admin'] },
        { to: 'refused', actors: ['store'] },
        { to: 'cancelled', actors: ['customer', 'system', 'admin'] }, // sistema = timeout de aceite
    ],
    accepted: [
        { to: 'in_preparation', actors: ['store', 'admin'] },
        // DEC-036: na entrega Webag o papel da loja termina em "pronto para coleta"; o resto é da logística.
        { to: 'ready_for_collection', actors: ['store', 'admin'], mode: 'delivery' },
        { to: 'ready_for_pickup', actors: ['store', 'admin'], mode: 'pickup' },
        { to: 'cancelled', actors: ['customer', 'store', 'admin'] },
    ],
    in_preparation: [
        { to: 'ready_for_collection', actors: ['store', 'admin'], mode: 'delivery' },
        { to: 'ready_for_pickup', actors: ['store', 'admin'], mode: 'pickup' },
        { to: 'cancelled', actors: ['store', 'admin'] }, // cliente só por solicitação aprovada (RN-08)
    ],
    ready_for_collection: [
        { to: 'out_for_delivery', actors: ['admin', 'system'], mode: 'delivery' }, // motoboy coletou (logística)
        { to: 'in_preparation', actors: ['store', 'admin'], mode: 'delivery' }, // "voltar para separação": a loja só enquanto não há motoboy (o serviço confere)
        { to: 'cancelled', actors: ['admin'] },
    ],
    out_for_delivery: [
        { to: 'delivered', actors: ['admin', 'system'] }, // a loja NÃO marca entregue na entrega Webag
        { to: 'cancelled', actors: ['admin'] },
    ],
    ready_for_pickup: [
        { to: 'delivered', actors: ['store', 'system', 'admin'] },
        { to: 'cancelled', actors: ['admin', 'store', 'system'] }, // sistema: retirada não feita no prazo
    ],
    delivered: [],
    cancelled: [],
    refused: [],
    expired: [],
};
export function canTransition(from, to, actor, mode) {
    return RULES[from].some((rule) => rule.to === to && rule.actors.includes(actor) && (rule.mode === undefined || rule.mode === mode));
}
/** Próximos estados possíveis para o ator (sem considerar permissão de membro, que é do controller). */
export function nextStatuses(from, actor, mode) {
    return RULES[from].filter((r) => r.actors.includes(actor) && (r.mode === undefined || r.mode === mode)).map((r) => r.to);
}
export const isTerminal = (status) => TERMINAL_STATUSES.includes(status);
/** O que o cliente pode fazer agora (`allowedActions` do contrato). */
export function customerActions(status) {
    switch (status) {
        case 'awaiting_payment':
        case 'received':
        case 'accepted':
            return ['cancel', 'contact_store'];
        case 'in_preparation':
            return ['request_cancel', 'contact_store'];
        case 'ready_for_collection':
            return ['contact_store'];
        case 'out_for_delivery':
            return ['contact_store', 'report_not_received'];
        case 'ready_for_pickup':
            return ['contact_store'];
        case 'delivered':
            return ['contact_store', 'rate', 'request_exchange'];
        default:
            return [];
    }
}
/** Estorno é devido ao encerrar sem entrega um pedido que já foi pago (RN-08). */
export const refundDueOnCancel = (from) => PAID_STATUSES.includes(from) && from !== 'delivered';
//# sourceMappingURL=state.js.map