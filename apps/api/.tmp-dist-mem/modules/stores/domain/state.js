/** Máquina de estados da loja (RN-16, R-29). Toda transição fora desta tabela é recusada e auditada. */
export const STORE_STATUSES = ['draft', 'in_review', 'correction_requested', 'approved', 'rejected', 'suspended', 'closed'];
/** `closed` é terminal e só nasce da exclusão da conta do dono (privacy, WB-213 C8): não há transição de usuário para ele. */
export const STORE_TRANSITIONS = [
    { from: 'draft', to: 'in_review', actor: 'merchant' },
    { from: 'in_review', to: 'approved', actor: 'admin' },
    { from: 'in_review', to: 'correction_requested', actor: 'admin' },
    { from: 'correction_requested', to: 'in_review', actor: 'merchant' },
    { from: 'in_review', to: 'rejected', actor: 'admin' },
    { from: 'approved', to: 'suspended', actor: 'admin' },
    { from: 'suspended', to: 'approved', actor: 'admin' },
];
export const canTransitionStore = (from, to, actor) => STORE_TRANSITIONS.some((t) => t.from === from && t.to === to && t.actor === actor);
/** Rascunho e correção pedida são os estados em que o lojista edita dados e documentos de onboarding. */
export const isEditableByMerchant = (status) => status === 'draft' || status === 'correction_requested';
//# sourceMappingURL=state.js.map