const clean = (text) => (text ?? '').replace(/[\r\n]+/g, ' ').trim();
export function buildCourierMessage(d) {
    const head = d.kind === 'delivery' ? `Webag - Entrega #${d.number}` : d.kind === 'exchange_pickup' ? `Webag - Troca #${d.number} (coleta)` : `Webag - Troca #${d.number} (entrega da peça nova)`;
    const lines = d.kind === 'exchange_pickup'
        ? [
            head,
            `COLETAR com ${clean(d.customerFirstName)}, ${clean(d.dropoffAddress)}. Telefone: ${clean(d.customerPhone) || 'sem telefone'}`,
            `LEVAR PARA: ${clean(d.storeName)}, ${clean(d.pickupAddress)}. Contato da loja: ${clean(d.storePhone) || 'sem telefone'}`,
            'Cliente entrega o item na embalagem. Sem cobrança.',
        ]
        : [
            head,
            `COLETA: ${clean(d.storeName)}, ${clean(d.pickupAddress)}. Contato da loja: ${clean(d.storePhone) || 'sem telefone'}`,
            `ENTREGA: ${clean(d.dropoffAddress)}. Cliente: ${clean(d.customerFirstName)}, ${clean(d.customerPhone) || 'sem telefone'}`,
            `Volumes: ${d.volumes}.${d.note ? ` Obs.: ${clean(d.note).slice(0, 100)}` : ''}${d.kind === 'exchange_return' ? ' Troca: peça nova.' : ''}`,
            'Pagamento: pago no app. Não cobrar do cliente.',
            'Ao entregar, peça o código de 4 dígitos ao cliente.',
        ];
    return [...lines, 'Responda OK para confirmar.'].join('\n');
}
/** Telefone BR com DDD (10 ou 11 dígitos) -> formato internacional sem `+` (`55...`); `null` se inválido. */
export function normalizePhone(input) {
    const digits = input.replace(/\D/g, '').replace(/^0+/, '');
    const national = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
    if (!/^[1-9]{2}9?\d{8}$/.test(national))
        return null;
    if (national.length === 11 && national[2] !== '9')
        return null; // celular tem o 9
    return `55${national}`;
}
export const whatsappLink = (phone, message) => `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
//# sourceMappingURL=whatsapp.js.map