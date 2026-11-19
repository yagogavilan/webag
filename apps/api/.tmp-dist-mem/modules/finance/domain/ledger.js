import { roundHalfUp } from './money.js';
/**
 * Plano de contas (ledger de dupla entrada, SEC-041). Toda transação fecha: soma dos débitos = soma dos créditos.
 *  - provider_clearing: dinheiro cobrado do cliente e ainda não devolvido, no provedor (débito = entrou);
 *  - merchant_payable: o que é da loja (crédito = a favor da loja);
 *  - commission_revenue / service_fee_revenue / delivery_fee_revenue: receita da Webag (crédito; a taxa de entrega é da Webag, DEC-036a);
 *  - platform_promo_expense: desconto da plataforma absorvido pela Webag (débito);
 *  - webag_coverage_cash: dinheiro da própria Webag que devolveu ao cliente um estorno que o provedor não concluiu (DEC-020a);
 *    a parte da loja vira dívida dela em `merchant_payable` (saldo negativo);
 *  - exchange_fee_revenue: taxa de coleta/reentrega da troca, receita da Webag (DEC-037, DT-049);
 *  - logistics_cost_expense / courier_payable / courier_payout_cash: custo pago ao motoboy (despesa de logística, a pagar ao motoboy
 *    e o pagamento feito por PIX fora do app, DEC-036c). O custo nasce quando a operação o registra e quita quando o financeiro marca como pago.
 * Em split o provedor repassa direto à loja; o ledger registra a conta, quem move o dinheiro é o provedor (DEC-016).
 */
export const LEDGER_ACCOUNTS = ['provider_clearing', 'merchant_payable', 'commission_revenue', 'service_fee_revenue', 'delivery_fee_revenue', 'platform_promo_expense', 'webag_coverage_cash', 'exchange_fee_revenue', 'logistics_cost_expense', 'courier_payable', 'courier_payout_cash'];
export const LEDGER_KINDS = ['sale', 'provider_fee', 'refund', 'coverage', 'adjustment', 'exchange_fee', 'exchange_fee_refund', 'logistics_cost', 'courier_payout'];
/** Linha a partir de um valor com sinal (positivo = débito). Zero some; negativo inverte o lado (nunca grava valor <= 0). */
const signed = (account, debitCents) => debitCents === 0 ? [] : [{ account, direction: debitCents > 0 ? 'debit' : 'credit', amountCents: Math.abs(debitCents) }];
export const isBalanced = (lines) => lines.reduce((sum, l) => sum + (l.direction === 'debit' ? l.amountCents : -l.amountCents), 0) === 0;
/** Pagamento aprovado: o cliente pagou `total`; a loja fica com bruto - comissão; a Webag com comissão + taxa de serviço (menos o cupom dela). */
export function saleLines(finance) {
    const lines = [
        ...signed('provider_clearing', finance.totalCents),
        ...signed('platform_promo_expense', finance.platformDiscountCents),
        ...signed('merchant_payable', -finance.merchantNetBeforeProviderFeeCents),
        ...signed('commission_revenue', -finance.commissionCents),
        ...signed('service_fee_revenue', -finance.serviceFeeCents),
        ...signed('delivery_fee_revenue', -finance.deliveryFeeCents),
    ];
    assertBalanced(lines);
    return lines;
}
/** Tarifa do provedor (não volta no estorno, HIP-016): sai da parte da loja e do dinheiro no provedor. */
export function providerFeeLines(feeCents) {
    const lines = [...signed('merchant_payable', feeCents), ...signed('provider_clearing', -feeCents)];
    assertBalanced(lines);
    return lines;
}
/**
 * Estorno de `refundCents` sobre um pagamento de `finance.totalCents` que já tinha `refundedBeforeCents` estornados.
 * Comissão, taxa de serviço e desconto da plataforma voltam proporcionalmente, pela diferença dos acumulados
 * arredondados (a soma de vários parciais é igual ao estorno total, sem perder centavo). A diferença de arredondamento
 * fica com a loja (RN-01): `merchant_payable` é o complemento que fecha a transação.
 */
export function refundLines(finance, refundedBeforeCents, refundCents, source = 'provider_clearing') {
    const after = refundedBeforeCents + refundCents;
    if (refundCents <= 0 || after > finance.totalCents)
        throw new Error('estorno fora do valor pago');
    const share = (component) => roundHalfUp(component * after, finance.totalCents) - roundHalfUp(component * refundedBeforeCents, finance.totalCents);
    const commission = share(finance.commissionCents);
    const serviceFee = share(finance.serviceFeeCents);
    const deliveryFee = share(finance.deliveryFeeCents);
    const promo = share(finance.platformDiscountCents);
    const merchant = refundCents + promo - commission - serviceFee - deliveryFee;
    const lines = [
        ...signed(source, -refundCents),
        ...signed('commission_revenue', commission),
        ...signed('service_fee_revenue', serviceFee),
        ...signed('delivery_fee_revenue', deliveryFee),
        ...signed('platform_promo_expense', -promo),
        ...signed('merchant_payable', merchant),
    ];
    assertBalanced(lines);
    return lines;
}
/**
 * Pagamento da troca (DEC-047/I12): entra `fee + difference` no provedor. A taxa de coleta é receita da Webag; a diferença de preço
 * da peça nova é da loja, menos a comissão proporcional (`differenceCommission`, receita da Webag), como numa venda. Com diferença,
 * a cobrança é na conta da loja com `application_fee = taxa + comissão da diferença` (split): nada fica como passivo sem repasse.
 */
export function exchangeFeeLines(feeCents, differenceCents, differenceCommissionCents = 0) {
    if (differenceCommissionCents < 0 || differenceCommissionCents > differenceCents)
        throw new Error('comissão da diferença inválida');
    const lines = [
        ...signed('provider_clearing', feeCents + differenceCents),
        ...signed('exchange_fee_revenue', -feeCents),
        ...signed('commission_revenue', -differenceCommissionCents),
        ...signed('merchant_payable', -(differenceCents - differenceCommissionCents)),
    ];
    assertBalanced(lines);
    return lines;
}
/** Estorno do pagamento da troca (troca cancelada/expirada): devolve taxa, comissão e diferença na mesma proporção, pela diferença dos acumulados arredondados. */
export function exchangeFeeRefundLines(feeCents, differenceCents, refundedBeforeCents, refundCents, differenceCommissionCents = 0) {
    const total = feeCents + differenceCents;
    const after = refundedBeforeCents + refundCents;
    if (refundCents <= 0 || after > total)
        throw new Error('estorno fora do valor pago');
    const share = (component) => roundHalfUp(component * after, total) - roundHalfUp(component * refundedBeforeCents, total);
    const fee = share(feeCents);
    const commission = share(differenceCommissionCents);
    const lines = [...signed('provider_clearing', -refundCents), ...signed('exchange_fee_revenue', fee), ...signed('commission_revenue', commission), ...signed('merchant_payable', refundCents - fee - commission)];
    assertBalanced(lines);
    return lines;
}
/** Custo da corrida pago ao motoboy: despesa de logística a pagar ao motoboy. `deltaCents` negativo corrige para baixo (lançamento inverso). */
export function logisticsCostLines(deltaCents) {
    const lines = [...signed('logistics_cost_expense', deltaCents), ...signed('courier_payable', -deltaCents)];
    assertBalanced(lines);
    return lines;
}
/** Pagamento ao motoboy (PIX feito fora do app, marcado como pago): quita o a pagar. */
export function courierPayoutLines(costCents) {
    const lines = [...signed('courier_payable', costCents), ...signed('courier_payout_cash', -costCents)];
    assertBalanced(lines);
    return lines;
}
function assertBalanced(lines) {
    if (!isBalanced(lines))
        throw new Error('lançamento não fecha: débitos diferentes de créditos');
}
/** Saldo de uma conta a partir das linhas (débito positivo). */
export const accountBalance = (lines, account) => lines.filter((l) => l.account === account).reduce((sum, l) => sum + (l.direction === 'debit' ? l.amountCents : -l.amountCents), 0);
//# sourceMappingURL=ledger.js.map