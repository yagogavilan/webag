import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ledgerEntries, ledgerTransactions } from './db/schema.js';
import type { OrderFinance } from './domain/commission.js';
import { accountBalance, courierPayoutLines, exchangeFeeLines, exchangeFeeRefundLines, logisticsCostLines, providerFeeLines, refundLines, saleLines, type LedgerAccount, type LedgerKind, type LedgerLine } from './domain/ledger.js';

export interface OrderBalances {
  /** Pago - estornado - tarifa do provedor, na conta do provedor. */
  providerClearing: number;
  /** A favor da loja: líquido (negativo = loja deve). */
  merchantPayable: number;
  commissionRevenue: number;
  serviceFeeRevenue: number;
  /** Taxa de entrega: receita da Webag (DEC-036a). */
  deliveryFeeRevenue: number;
  platformPromoExpense: number;
  paidCents: number;
  refundedCents: number;
  /** Devolvido ao cliente com dinheiro da Webag (cobertura, DEC-020a). */
  coveredCents: number;
  providerFeeCents: number;
  /** Troca (DT-049): taxa de coleta/reentrega, receita da Webag; entrou e voltou no provedor (taxa + diferença). */
  exchangeFeeRevenue: number;
  exchangeReceivedCents: number;
  exchangeRefundedCents: number;
  /** Custo de logística (despesa), a pagar ao motoboy e o já pago por PIX fora do app. */
  logisticsCostExpense: number;
  courierPayable: number;
  courierPaidCents: number;
}

/**
 * Ledger append-only (SEC-041). Toda gravação é idempotente por `dedupeKey` e roda na transação de quem chama (o pedido
 * pago e o lançamento nascem juntos ou nenhum dos dois). O fechamento (débitos = créditos) é conferido aqui, na função
 * pura e, de novo, por uma constraint trigger no banco.
 */
@Injectable()
export class LedgerService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  private async post(tx: DbOrTx, header: { orderId: string; storeId: string | null; attemptId: string | null; kind: LedgerKind; dedupeKey: string; meta: Record<string, unknown> }, lines: LedgerLine[]): Promise<boolean> {
    if (lines.length === 0) return false;
    const [created] = await tx.insert(ledgerTransactions).values(header).onConflictDoNothing({ target: ledgerTransactions.dedupeKey }).returning({ id: ledgerTransactions.id });
    if (!created) return false; // já lançado: a repetição não duplica
    await tx.insert(ledgerEntries).values(lines.map((l) => ({ transactionId: created.id, account: l.account, direction: l.direction, amountCents: l.amountCents })));
    return true;
  }

  async hasSale(orderId: string, exec: DbOrTx = this.db): Promise<boolean> {
    const [row] = await exec.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(and(eq(ledgerTransactions.orderId, orderId), eq(ledgerTransactions.kind, 'sale')));
    return row !== undefined;
  }

  /** Venda: pagamento aprovado. O `finance` (percentuais congelados) fica no `meta` e sustenta os estornos. */
  recordSale(tx: DbOrTx, input: { orderId: string; storeId: string; attemptId: string | null; finance: OrderFinance }): Promise<boolean> {
    return this.post(tx, { orderId: input.orderId, storeId: input.storeId, attemptId: input.attemptId, kind: 'sale', dedupeKey: `sale:${input.orderId}`, meta: { finance: input.finance } }, saleLines(input.finance));
  }

  /** Tarifa real do provedor (`fee_details`), quando conhecida. Uma por pedido. */
  recordProviderFee(tx: DbOrTx, input: { orderId: string; storeId: string; attemptId: string | null; feeCents: number }): Promise<boolean> {
    return this.post(tx, { orderId: input.orderId, storeId: input.storeId, attemptId: input.attemptId, kind: 'provider_fee', dedupeKey: `fee:${input.orderId}`, meta: { feeCents: input.feeCents } }, providerFeeLines(input.feeCents));
  }

  /**
   * Estorno confirmado pelo provedor. `refundKey` é a chave de idempotência do estorno (a mesma do `payment_refunds`).
   * Trava a venda (`FOR UPDATE`) para serializar estornos do mesmo pedido e lê o já estornado dentro da transação.
   */
  async recordRefund(tx: DbOrTx, input: { orderId: string; refundCents: number; refundKey: string; reason?: string }): Promise<boolean> {
    const [sale] = await tx
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.orderId, input.orderId), eq(ledgerTransactions.kind, 'sale')))
      .for('update');
    if (!sale) throw errors.conflict('LEDGER_SALE_NOT_FOUND', 'Pedido sem venda lançada', 'O estorno só é lançado depois da venda.');
    const dedupeKey = `refund:${input.orderId}:${input.refundKey}`;
    const [existing] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, dedupeKey));
    if (existing) return false;
    const finance = (sale.meta as { finance: OrderFinance }).finance;
    const refundedBefore = await this.refundedCents(tx, input.orderId);
    const lines = refundLines(finance, refundedBefore, input.refundCents);
    return this.post(tx, { orderId: input.orderId, storeId: sale.storeId, attemptId: sale.attemptId, kind: 'refund', dedupeKey, meta: { refundCents: input.refundCents, refundedBeforeCents: refundedBefore, reason: input.reason ?? null } }, lines);
  }

  /**
   * Cobertura da Webag (DEC-020a): o provedor não concluiu o estorno e a Webag devolveu o valor ao cliente com dinheiro dela.
   * Mesmas partes do estorno (comissão e taxa voltam, a loja fica devendo), mas sai de `webag_coverage_cash`, não do provedor.
   */
  async recordCoverage(tx: DbOrTx, input: { orderId: string; coverageCents: number; coverageKey: string; reason?: string }): Promise<boolean> {
    const [sale] = await tx.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.orderId, input.orderId), eq(ledgerTransactions.kind, 'sale'))).for('update');
    if (!sale) throw errors.conflict('LEDGER_SALE_NOT_FOUND', 'Pedido sem venda lançada', 'A cobertura só é lançada depois da venda.');
    const dedupeKey = `coverage:${input.orderId}:${input.coverageKey}`;
    const [existing] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, dedupeKey));
    if (existing) return false;
    const finance = (sale.meta as { finance: OrderFinance }).finance;
    const before = await this.refundedCents(tx, input.orderId);
    const lines = refundLines(finance, before, input.coverageCents, 'webag_coverage_cash');
    return this.post(tx, { orderId: input.orderId, storeId: sale.storeId, attemptId: sale.attemptId, kind: 'coverage', dedupeKey, meta: { coverageCents: input.coverageCents, refundedBeforeCents: before, reason: input.reason ?? null } }, lines);
  }

  /**
   * DT-049: pagamento da taxa da troca (e da diferença de preço da peça nova) aprovado na conta da Webag. Os lançamentos ficam sob o
   * pedido original da troca (`orderId`), sem loja na taxa; a diferença fica a favor da loja. Idempotente por troca.
   */
  recordExchangePayment(tx: DbOrTx, input: { orderId: string; storeId: string; exchangeId: string; attemptId: string; feeCents: number; differenceCents: number }): Promise<boolean> {
    return this.post(tx, { orderId: input.orderId, storeId: input.storeId, attemptId: input.attemptId, kind: 'exchange_fee', dedupeKey: `exchange-fee:${input.exchangeId}`, meta: { exchangeId: input.exchangeId, feeCents: input.feeCents, differenceCents: input.differenceCents } }, exchangeFeeLines(input.feeCents, input.differenceCents));
  }

  /** Estorno do pagamento da troca confirmado pelo provedor (troca cancelada/expirada). Idempotente por chave de estorno. */
  async recordExchangeFeeRefund(tx: DbOrTx, input: { orderId: string; storeId: string; exchangeId: string; attemptId: string; feeCents: number; differenceCents: number; refundCents: number; refundKey: string }): Promise<boolean> {
    const dedupeKey = `exchange-fee-refund:${input.exchangeId}:${input.refundKey}`;
    const [received] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, `exchange-fee:${input.exchangeId}`));
    if (!received) return false; // pagamento nunca lançado (ex.: tentativa de troca que não valeu): nada a reverter
    const [existing] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, dedupeKey));
    if (existing) return false;
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(case when ${ledgerEntries.account} = 'provider_clearing' and ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amountCents} else 0 end), 0)` })
      .from(ledgerEntries)
      .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(and(eq(ledgerTransactions.kind, 'exchange_fee_refund'), sql`${ledgerTransactions.dedupeKey} like ${`exchange-fee-refund:${input.exchangeId}:%`}`));
    const before = Number(row?.total ?? 0);
    return this.post(tx, { orderId: input.orderId, storeId: input.storeId, attemptId: input.attemptId, kind: 'exchange_fee_refund', dedupeKey, meta: { exchangeId: input.exchangeId, refundCents: input.refundCents, refundedBeforeCents: before } }, exchangeFeeRefundLines(input.feeCents, input.differenceCents, before, input.refundCents));
  }

  /**
   * DT-049: custo da corrida pago ao motoboy (despesa de logística a pagar). Chamado a cada registro/correção com o custo TOTAL
   * novo; lança só a diferença para o que já foi lançado (correção para cima ou para baixo). Sob o pedido da corrida, sem loja.
   */
  async recordLogisticsCost(tx: DbOrTx, input: { orderId: string; deliveryId: string; costCents: number; kind: string }): Promise<boolean> {
    const prefix = `logistics-cost:${input.deliveryId}:`;
    const [row] = await tx
      .select({
        n: sql<number>`count(distinct ${ledgerTransactions.id})::int`,
        booked: sql<string>`coalesce(sum(case when ${ledgerEntries.account} = 'courier_payable' then (case when ${ledgerEntries.direction} = 'credit' then 1 else -1 end) * ${ledgerEntries.amountCents} else 0 end), 0)`,
      })
      .from(ledgerEntries)
      .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(and(eq(ledgerTransactions.kind, 'logistics_cost'), sql`${ledgerTransactions.dedupeKey} like ${`${prefix}%`}`));
    const delta = input.costCents - Number(row?.booked ?? 0);
    if (delta === 0) return false;
    return this.post(tx, { orderId: input.orderId, storeId: null, attemptId: null, kind: 'logistics_cost', dedupeKey: `${prefix}${(row?.n ?? 0) + 1}`, meta: { deliveryId: input.deliveryId, deliveryKind: input.kind, costCents: input.costCents, deltaCents: delta } }, logisticsCostLines(delta));
  }

  /** DT-049: o financeiro marcou a corrida como paga (PIX fora do app): quita o a pagar ao motoboy. Idempotente por corrida. */
  recordCourierPayout(tx: DbOrTx, input: { orderId: string; deliveryId: string; costCents: number; paidOn: Date }): Promise<boolean> {
    return this.post(tx, { orderId: input.orderId, storeId: null, attemptId: null, kind: 'courier_payout', dedupeKey: `courier-payout:${input.deliveryId}`, meta: { deliveryId: input.deliveryId, costCents: input.costCents, paidOn: input.paidOn.toISOString() } }, courierPayoutLines(input.costCents));
  }

  /** Devolvido ao cliente, por estorno do provedor OU por cobertura da Webag (base das partes proporcionais). */
  private async refundedCents(tx: DbOrTx, orderId: string): Promise<number> {
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(case when ${ledgerEntries.account} in ('provider_clearing', 'webag_coverage_cash') and ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amountCents} else 0 end), 0)` })
      .from(ledgerEntries)
      .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(and(eq(ledgerTransactions.orderId, orderId), inArray(ledgerTransactions.kind, ['refund', 'coverage'])));
    return Number(row?.total ?? 0);
  }

  async lines(orderId: string, exec: DbOrTx = this.db): Promise<(LedgerLine & { kind: LedgerKind; at: Date })[]> {
    const rows = await exec
      .select({ account: ledgerEntries.account, direction: ledgerEntries.direction, amountCents: ledgerEntries.amountCents, kind: ledgerTransactions.kind, at: ledgerEntries.createdAt })
      .from(ledgerEntries)
      .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(eq(ledgerTransactions.orderId, orderId))
      .orderBy(asc(ledgerEntries.id));
    return rows;
  }

  async balances(orderId: string, exec: DbOrTx = this.db): Promise<OrderBalances> {
    const rows = await this.lines(orderId, exec);
    const account = (a: LedgerAccount) => accountBalance(rows, a);
    const credit = (a: LedgerAccount) => 0 - account(a); // `0 - 0` evita o -0
    const sum = (kind: LedgerKind, a: LedgerAccount, direction: 'debit' | 'credit') => rows.filter((r) => r.kind === kind && r.account === a && r.direction === direction).reduce((s, r) => s + r.amountCents, 0);
    return {
      providerClearing: account('provider_clearing'),
      merchantPayable: credit('merchant_payable'),
      commissionRevenue: credit('commission_revenue'),
      serviceFeeRevenue: credit('service_fee_revenue'),
      deliveryFeeRevenue: credit('delivery_fee_revenue'),
      platformPromoExpense: account('platform_promo_expense'),
      paidCents: sum('sale', 'provider_clearing', 'debit'),
      refundedCents: sum('refund', 'provider_clearing', 'credit'),
      coveredCents: sum('coverage', 'webag_coverage_cash', 'credit'),
      providerFeeCents: sum('provider_fee', 'provider_clearing', 'credit'),
      exchangeFeeRevenue: credit('exchange_fee_revenue'),
      exchangeReceivedCents: sum('exchange_fee', 'provider_clearing', 'debit'),
      exchangeRefundedCents: sum('exchange_fee_refund', 'provider_clearing', 'credit'),
      logisticsCostExpense: account('logistics_cost_expense'),
      courierPayable: credit('courier_payable'),
      courierPaidCents: sum('courier_payout', 'courier_payable', 'debit'),
    };
  }

  /** Invariante do pedido (WB-156 C4): conta no provedor = pago - estornado - tarifa; e cada lançamento fecha. */
  async verifyOrder(orderId: string, exec: DbOrTx = this.db): Promise<{ ok: boolean; problems: string[] }> {
    const [b, unbalanced] = await Promise.all([
      this.balances(orderId, exec),
      exec.execute(sql`
        select t.id from ledger_transactions t join ledger_entries e on e.transaction_id = t.id
        where t.order_id = ${orderId} group by t.id
        having sum(case e.direction when 'debit' then e.amount_cents else -e.amount_cents end) <> 0`),
    ]);
    const problems: string[] = [];
    if (b.providerClearing !== b.paidCents + b.exchangeReceivedCents - b.refundedCents - b.exchangeRefundedCents - b.providerFeeCents) problems.push('provider_clearing diferente de pago - estornado - tarifa (e taxa de troca recebida - devolvida)');
    if (b.refundedCents > b.paidCents) problems.push('estornado maior que o pago');
    if (unbalanced.rows.length > 0) problems.push('lançamento que não fecha');
    return { ok: problems.length === 0, problems };
  }

  /** Pedidos com lançamento que não fecha: o relatório de conciliação interna (WB-157). */
  async unbalancedOrders(orderIds: readonly string[], exec: DbOrTx = this.db): Promise<string[]> {
    const bad: string[] = [];
    for (const id of orderIds) if (!(await this.verifyOrder(id, exec)).ok) bad.push(id);
    return bad;
  }
}

