import type { OrderFinance } from './commission.js';
import { roundHalfUp } from './money.js';

/**
 * Plano de contas (ledger de dupla entrada, SEC-041). Toda transação fecha: soma dos débitos = soma dos créditos.
 *  - provider_clearing: dinheiro cobrado do cliente e ainda não devolvido, no provedor (débito = entrou);
 *  - merchant_payable: o que é da loja (crédito = a favor da loja);
 *  - commission_revenue / service_fee_revenue: receita da Webag (crédito);
 *  - platform_promo_expense: desconto da plataforma absorvido pela Webag (débito);
 *  - webag_coverage_cash: dinheiro da própria Webag que devolveu ao cliente um estorno que o provedor não concluiu (DEC-020a);
 *    a parte da loja vira dívida dela em `merchant_payable` (saldo negativo).
 * Em split o provedor repassa direto à loja; o ledger registra a conta, quem move o dinheiro é o provedor (DEC-016).
 */
export const LEDGER_ACCOUNTS = ['provider_clearing', 'merchant_payable', 'commission_revenue', 'service_fee_revenue', 'platform_promo_expense', 'webag_coverage_cash'] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];
export const LEDGER_KINDS = ['sale', 'provider_fee', 'refund', 'coverage', 'adjustment'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export interface LedgerLine {
  account: LedgerAccount;
  direction: 'debit' | 'credit';
  amountCents: number;
}

/** Linha a partir de um valor com sinal (positivo = débito). Zero some; negativo inverte o lado (nunca grava valor <= 0). */
const signed = (account: LedgerAccount, debitCents: number): LedgerLine[] =>
  debitCents === 0 ? [] : [{ account, direction: debitCents > 0 ? 'debit' : 'credit', amountCents: Math.abs(debitCents) }];

export const isBalanced = (lines: readonly LedgerLine[]): boolean =>
  lines.reduce((sum, l) => sum + (l.direction === 'debit' ? l.amountCents : -l.amountCents), 0) === 0;

/** Pagamento aprovado: o cliente pagou `total`; a loja fica com bruto - comissão; a Webag com comissão + taxa de serviço (menos o cupom dela). */
export function saleLines(finance: OrderFinance): LedgerLine[] {
  const lines = [
    ...signed('provider_clearing', finance.totalCents),
    ...signed('platform_promo_expense', finance.platformDiscountCents),
    ...signed('merchant_payable', -finance.merchantNetBeforeProviderFeeCents),
    ...signed('commission_revenue', -finance.commissionCents),
    ...signed('service_fee_revenue', -finance.serviceFeeCents),
  ];
  assertBalanced(lines);
  return lines;
}

/** Tarifa do provedor (não volta no estorno, HIP-016): sai da parte da loja e do dinheiro no provedor. */
export function providerFeeLines(feeCents: number): LedgerLine[] {
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
export function refundLines(finance: OrderFinance, refundedBeforeCents: number, refundCents: number, source: 'provider_clearing' | 'webag_coverage_cash' = 'provider_clearing'): LedgerLine[] {
  const after = refundedBeforeCents + refundCents;
  if (refundCents <= 0 || after > finance.totalCents) throw new Error('estorno fora do valor pago');
  const share = (component: number): number => roundHalfUp(component * after, finance.totalCents) - roundHalfUp(component * refundedBeforeCents, finance.totalCents);
  const commission = share(finance.commissionCents);
  const serviceFee = share(finance.serviceFeeCents);
  const promo = share(finance.platformDiscountCents);
  const merchant = refundCents + promo - commission - serviceFee;
  const lines = [
    ...signed(source, -refundCents),
    ...signed('commission_revenue', commission),
    ...signed('service_fee_revenue', serviceFee),
    ...signed('platform_promo_expense', -promo),
    ...signed('merchant_payable', merchant),
  ];
  assertBalanced(lines);
  return lines;
}

function assertBalanced(lines: readonly LedgerLine[]): void {
  if (!isBalanced(lines)) throw new Error('lançamento não fecha: débitos diferentes de créditos');
}

/** Saldo de uma conta a partir das linhas (débito positivo). */
export const accountBalance = (lines: readonly LedgerLine[], account: LedgerAccount): number =>
  lines.filter((l) => l.account === account).reduce((sum, l) => sum + (l.direction === 'debit' ? l.amountCents : -l.amountCents), 0);
