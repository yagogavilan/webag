/** Dinheiro: o MP fala em reais com decimais; o Webag, em centavos inteiros. `toFixed(2)` evita 0,1 + 0,2. */
export const toReais = (cents) => Number((cents / 100).toFixed(2));
export const toCents = (reais) => Math.round((reais ?? 0) * 100);
/**
 * Estados do MP para os do domínio (ADR-002). `authorized`/`in_process` ainda não são dinheiro: seguem `pending`.
 * PIX vencido chega como `cancelled` com `status_detail = expired`. `charged_back` e `in_mediation` mantêm `approved`
 * (o estado contestado vai em `ProviderPayment.disputed` e o pagamento o trata em `sync`: ver review-ondas-3-5 I2).
 */
export function mapStatus(payment) {
    switch (payment.status) {
        case 'approved':
        case 'charged_back':
        case 'in_mediation':
            return 'approved';
        case 'rejected':
            return 'declined';
        case 'refunded':
            return 'refunded';
        case 'cancelled':
            return payment.status_detail === 'expired' ? 'expired' : 'cancelled';
        case 'pending':
        case 'in_process':
        case 'authorized':
            return payment.status_detail === 'pending_challenge' && payment.three_ds_info?.external_resource_url ? 'pending_3ds' : 'pending';
        default:
            return 'pending';
    }
}
/** Motivo de recusa em código estável do Webag (o texto pt-BR é do pedido). Nunca repassa o texto cru do provedor. */
export function mapDecline(detail) {
    if (!detail)
        return 'rejected_by_issuer';
    if (detail.includes('insufficient_amount'))
        return 'insufficient_funds';
    if (detail.includes('bad_filled') || detail.includes('invalid') || detail.includes('blacklist'))
        return 'invalid_card';
    return 'rejected_by_issuer';
}
const feeSum = (payment, type) => (payment.fee_details ?? []).filter((f) => f.type === type).reduce((s, f) => s + toCents(f.amount), 0);
export function toProviderPayment(payment) {
    const status = mapStatus(payment);
    const applicationFee = feeSum(payment, 'application_fee');
    const providerFee = feeSum(payment, 'mercadopago_fee');
    return {
        providerPaymentId: String(payment.id),
        status,
        amountCents: toCents(payment.transaction_amount),
        currency: payment.currency_id ?? 'BRL',
        externalReference: payment.external_reference ?? '',
        // [confirmar no sandbox] se o MP devolve a comissão em `fee_details` (type application_fee) ou em `application_fee`.
        applicationFeeCents: applicationFee > 0 ? applicationFee : toCents(payment.application_fee),
        receiverId: payment.collector_id === undefined ? null : String(payment.collector_id),
        refundedCents: toCents(payment.transaction_amount_refunded),
        ...(providerFee > 0 ? { providerFeeCents: providerFee } : {}),
        ...(payment.point_of_interaction?.transaction_data?.qr_code ? { pixCopyPaste: payment.point_of_interaction.transaction_data.qr_code } : {}),
        ...(payment.point_of_interaction?.transaction_data?.qr_code_base64 ? { pixQrBase64: payment.point_of_interaction.transaction_data.qr_code_base64 } : {}),
        ...(status === 'pending_3ds' && payment.three_ds_info?.external_resource_url ? { threeDsUrl: payment.three_ds_info.external_resource_url } : {}),
        ...(status === 'declined' ? { declineReason: mapDecline(payment.status_detail) } : {}),
        ...(payment.status === 'charged_back' || payment.status === 'in_mediation' ? { disputed: true } : {}),
    };
}
/** `date_of_expiration` do MP: ISO com milissegundos e o offset explícito (-03:00, horário de Brasília). */
export function mpExpiration(at) {
    const local = new Date(at.getTime() - 3 * 3_600_000);
    return `${local.toISOString().slice(0, 23)}-03:00`;
}
//# sourceMappingURL=mercadopago.mapping.js.map