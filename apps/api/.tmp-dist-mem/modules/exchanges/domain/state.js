/** Transições válidas da solicitação de troca e quem pode fazê-las (validadas no servidor, RN-11). */
const RULES = {
    requested: [
        { to: 'awaiting_fee', actors: ['store', 'system', 'admin'] },
        { to: 'approved', actors: ['store', 'system', 'admin'] },
        { to: 'rejected', actors: ['store', 'admin'] },
        { to: 'in_mediation', actors: ['store', 'admin'] }, // defeito: a loja não recusa sozinha, vai à mediação
        { to: 'cancelled', actors: ['customer', 'admin'] },
    ],
    awaiting_fee: [
        { to: 'approved', actors: ['system', 'admin', 'customer'] }, // pagamento confirmado; admin: isenção da taxa (AT3); cliente: leva à loja sem diferença a pagar (B.1)
        { to: 'cancelled', actors: ['customer', 'system', 'admin'] }, // desistiu ou taxa não paga no prazo
    ],
    approved: [
        { to: 'item_received', actors: ['store', 'admin'] },
        { to: 'completed', actors: ['store', 'system', 'admin'] }, // troca na loja ou reembolso direto
        { to: 'in_mediation', actors: ['store', 'admin'] },
        { to: 'cancelled', actors: ['customer', 'admin'] },
        { to: 'expired', actors: ['system'] },
    ],
    item_received: [{ to: 'completed', actors: ['system', 'admin'] }],
    in_mediation: [
        { to: 'approved', actors: ['admin'] },
        { to: 'completed', actors: ['admin'] },
        { to: 'rejected', actors: ['admin'] },
    ],
    completed: [],
    rejected: [{ to: 'in_mediation', actors: ['customer'] }], // contestação do cliente (WB-176), uma vez e dentro do prazo
    cancelled: [],
    expired: [],
};
export const canExchangeTransition = (from, to, actor) => RULES[from].some((r) => r.to === to && r.actors.includes(actor));
export const isOpenExchange = (status) => status === 'requested' || status === 'awaiting_fee' || status === 'approved' || status === 'item_received' || status === 'in_mediation';
//# sourceMappingURL=state.js.map