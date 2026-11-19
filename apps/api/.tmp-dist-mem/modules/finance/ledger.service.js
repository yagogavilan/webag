var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ledgerEntries, ledgerTransactions } from './db/schema.js';
import { accountBalance, courierPayoutLines, exchangeFeeLines, exchangeFeeRefundLines, logisticsCostLines, providerFeeLines, refundLines, saleLines } from './domain/ledger.js';
/**
 * Ledger append-only (SEC-041). Toda gravação é idempotente por `dedupeKey` e roda na transação de quem chama (o pedido
 * pago e o lançamento nascem juntos ou nenhum dos dois). O fechamento (débitos = créditos) é conferido aqui, na função
 * pura e, de novo, por uma constraint trigger no banco.
 */
let LedgerService = class LedgerService {
    db;
    constructor(db) {
        this.db = db;
    }
    async post(tx, header, lines) {
        if (lines.length === 0)
            return false;
        const [created] = await tx.insert(ledgerTransactions).values(header).onConflictDoNothing({ target: ledgerTransactions.dedupeKey }).returning({ id: ledgerTransactions.id });
        if (!created)
            return false; // já lançado: a repetição não duplica
        await tx.insert(ledgerEntries).values(lines.map((l) => ({ transactionId: created.id, account: l.account, direction: l.direction, amountCents: l.amountCents })));
        return true;
    }
    async hasSale(orderId, exec = this.db) {
        const [row] = await exec.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(and(eq(ledgerTransactions.orderId, orderId), eq(ledgerTransactions.kind, 'sale')));
        return row !== undefined;
    }
    /** Venda: pagamento aprovado. O `finance` (percentuais congelados) fica no `meta` e sustenta os estornos. */
    recordSale(tx, input) {
        return this.post(tx, { orderId: input.orderId, storeId: input.storeId, attemptId: input.attemptId, kind: 'sale', dedupeKey: `sale:${input.orderId}`, meta: { finance: input.finance } }, saleLines(input.finance));
    }
    /** Tarifa real do provedor (`fee_details`), quando conhecida. Uma por pedido. */
    recordProviderFee(tx, input) {
        return this.post(tx, { orderId: input.orderId, storeId: input.storeId, attemptId: input.attemptId, kind: 'provider_fee', dedupeKey: `fee:${input.orderId}`, meta: { feeCents: input.feeCents } }, providerFeeLines(input.feeCents));
    }
    /**
     * Estorno confirmado pelo provedor. `refundKey` é a chave de idempotência do estorno (a mesma do `payment_refunds`).
     * Trava a venda (`FOR UPDATE`) para serializar estornos do mesmo pedido e lê o já estornado dentro da transação.
     */
    async recordRefund(tx, input) {
        const [sale] = await tx
            .select()
            .from(ledgerTransactions)
            .where(and(eq(ledgerTransactions.orderId, input.orderId), eq(ledgerTransactions.kind, 'sale')))
            .for('update');
        if (!sale)
            throw errors.conflict('LEDGER_SALE_NOT_FOUND', 'Pedido sem venda lançada', 'O estorno só é lançado depois da venda.');
        const dedupeKey = `refund:${input.orderId}:${input.refundKey}`;
        const [existing] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, dedupeKey));
        if (existing)
            return false;
        const finance = sale.meta.finance;
        const refundedBefore = await this.refundedCents(tx, input.orderId);
        const lines = refundLines(finance, refundedBefore, input.refundCents);
        return this.post(tx, { orderId: input.orderId, storeId: sale.storeId, attemptId: sale.attemptId, kind: 'refund', dedupeKey, meta: { refundCents: input.refundCents, refundedBeforeCents: refundedBefore, reason: input.reason ?? null } }, lines);
    }
    /**
     * I2: chargeback. O provedor debitou o valor ainda não devolvido; para o ledger é um estorno forçado (a comissão e as taxas voltam
     * e a loja fica devendo a parte dela), lançado como `adjustment` com chave única por pedido. A tarifa do provedor não volta.
     */
    async recordChargeback(tx, input) {
        const [sale] = await tx.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.orderId, input.orderId), eq(ledgerTransactions.kind, 'sale'))).for('update');
        if (!sale)
            return false;
        const dedupeKey = `chargeback:${input.orderId}`;
        const [existing] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, dedupeKey));
        if (existing)
            return false;
        const finance = sale.meta.finance;
        const before = await this.refundedCents(tx, input.orderId);
        const remaining = finance.totalCents - before;
        if (remaining <= 0)
            return false;
        return this.post(tx, { orderId: input.orderId, storeId: sale.storeId, attemptId: sale.attemptId, kind: 'adjustment', dedupeKey, meta: { chargebackCents: remaining, refundedBeforeCents: before, reason: input.reason ?? 'chargeback' } }, refundLines(finance, before, remaining));
    }
    /**
     * Cobertura da Webag (DEC-020a): o provedor não concluiu o estorno e a Webag devolveu o valor ao cliente com dinheiro dela.
     * Mesmas partes do estorno (comissão e taxa voltam, a loja fica devendo), mas sai de `webag_coverage_cash`, não do provedor.
     */
    async recordCoverage(tx, input) {
        const [sale] = await tx.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.orderId, input.orderId), eq(ledgerTransactions.kind, 'sale'))).for('update');
        if (!sale)
            throw errors.conflict('LEDGER_SALE_NOT_FOUND', 'Pedido sem venda lançada', 'A cobertura só é lançada depois da venda.');
        const dedupeKey = `coverage:${input.orderId}:${input.coverageKey}`;
        const [existing] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, dedupeKey));
        if (existing)
            return false;
        const finance = sale.meta.finance;
        const before = await this.refundedCents(tx, input.orderId);
        const lines = refundLines(finance, before, input.coverageCents, 'webag_coverage_cash');
        return this.post(tx, { orderId: input.orderId, storeId: sale.storeId, attemptId: sale.attemptId, kind: 'coverage', dedupeKey, meta: { coverageCents: input.coverageCents, refundedBeforeCents: before, reason: input.reason ?? null } }, lines);
    }
    /**
     * DT-049: pagamento da taxa da troca (e da diferença de preço da peça nova) aprovado na conta da Webag. Os lançamentos ficam sob o
     * pedido original da troca (`orderId`), sem loja na taxa; a diferença fica a favor da loja. Idempotente por troca.
     */
    recordExchangePayment(tx, input) {
        return this.post(tx, { orderId: input.orderId, storeId: input.storeId, attemptId: input.attemptId, kind: 'exchange_fee', dedupeKey: `exchange-fee:${input.exchangeId}`, meta: { exchangeId: input.exchangeId, feeCents: input.feeCents, differenceCents: input.differenceCents, differenceCommissionCents: input.differenceCommissionCents ?? 0 } }, exchangeFeeLines(input.feeCents, input.differenceCents, input.differenceCommissionCents ?? 0));
    }
    /** Estorno do pagamento da troca confirmado pelo provedor (troca cancelada/expirada). Idempotente por chave de estorno. */
    async recordExchangeFeeRefund(tx, input) {
        const dedupeKey = `exchange-fee-refund:${input.exchangeId}:${input.refundKey}`;
        const [received] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, `exchange-fee:${input.exchangeId}`));
        if (!received)
            return false; // pagamento nunca lançado (ex.: tentativa de troca que não valeu): nada a reverter
        const [existing] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.dedupeKey, dedupeKey));
        if (existing)
            return false;
        const [row] = await tx
            .select({ total: sql `coalesce(sum(case when ${ledgerEntries.account} = 'provider_clearing' and ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amountCents} else 0 end), 0)` })
            .from(ledgerEntries)
            .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
            .where(and(eq(ledgerTransactions.orderId, input.orderId), eq(ledgerTransactions.kind, 'exchange_fee_refund'), sql `${ledgerTransactions.dedupeKey} like ${`exchange-fee-refund:${input.exchangeId}:%`}`));
        const before = Number(row?.total ?? 0);
        return this.post(tx, { orderId: input.orderId, storeId: input.storeId, attemptId: input.attemptId, kind: 'exchange_fee_refund', dedupeKey, meta: { exchangeId: input.exchangeId, refundCents: input.refundCents, refundedBeforeCents: before } }, exchangeFeeRefundLines(input.feeCents, input.differenceCents, before, input.refundCents, input.differenceCommissionCents ?? 0));
    }
    /**
     * DT-049: custo da corrida pago ao motoboy (despesa de logística a pagar). Chamado a cada registro/correção com o custo TOTAL
     * novo; lança só a diferença para o que já foi lançado (correção para cima ou para baixo). Sob o pedido da corrida, sem loja.
     */
    async recordLogisticsCost(tx, input) {
        const prefix = `logistics-cost:${input.deliveryId}:`;
        const [row] = await tx
            .select({
            n: sql `count(distinct ${ledgerTransactions.id})::int`,
            booked: sql `coalesce(sum(case when ${ledgerEntries.account} = 'courier_payable' then (case when ${ledgerEntries.direction} = 'credit' then 1 else -1 end) * ${ledgerEntries.amountCents} else 0 end), 0)`,
        })
            .from(ledgerEntries)
            .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
            .where(and(eq(ledgerTransactions.orderId, input.orderId), eq(ledgerTransactions.kind, 'logistics_cost'), sql `${ledgerTransactions.dedupeKey} like ${`${prefix}%`}`));
        const delta = input.costCents - Number(row?.booked ?? 0);
        if (delta === 0)
            return false;
        return this.post(tx, { orderId: input.orderId, storeId: null, attemptId: null, kind: 'logistics_cost', dedupeKey: `${prefix}${(row?.n ?? 0) + 1}`, meta: { deliveryId: input.deliveryId, deliveryKind: input.kind, costCents: input.costCents, deltaCents: delta } }, logisticsCostLines(delta));
    }
    /** DT-049: o financeiro marcou a corrida como paga (PIX fora do app): quita o a pagar ao motoboy. Idempotente por corrida. */
    recordCourierPayout(tx, input) {
        return this.post(tx, { orderId: input.orderId, storeId: null, attemptId: null, kind: 'courier_payout', dedupeKey: `courier-payout:${input.deliveryId}`, meta: { deliveryId: input.deliveryId, costCents: input.costCents, paidOn: input.paidOn.toISOString() } }, courierPayoutLines(input.costCents));
    }
    /** Devolvido ao cliente, por estorno do provedor, cobertura da Webag OU chargeback (base das partes proporcionais). */
    async refundedCents(tx, orderId) {
        const [row] = await tx
            .select({ total: sql `coalesce(sum(case when ${ledgerEntries.account} in ('provider_clearing', 'webag_coverage_cash') and ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amountCents} else 0 end), 0)` })
            .from(ledgerEntries)
            .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
            .where(and(eq(ledgerTransactions.orderId, orderId), inArray(ledgerTransactions.kind, ['refund', 'coverage', 'adjustment'])));
        return Number(row?.total ?? 0);
    }
    async lines(orderId, exec = this.db) {
        const rows = await exec
            .select({ account: ledgerEntries.account, direction: ledgerEntries.direction, amountCents: ledgerEntries.amountCents, kind: ledgerTransactions.kind, at: ledgerEntries.createdAt })
            .from(ledgerEntries)
            .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
            .where(eq(ledgerTransactions.orderId, orderId))
            .orderBy(asc(ledgerEntries.id));
        return rows;
    }
    async balances(orderId, exec = this.db) {
        const rows = await this.lines(orderId, exec);
        const account = (a) => accountBalance(rows, a);
        const credit = (a) => 0 - account(a); // `0 - 0` evita o -0
        const sum = (kind, a, direction) => rows.filter((r) => r.kind === kind && r.account === a && r.direction === direction).reduce((s, r) => s + r.amountCents, 0);
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
            chargebackCents: sum('adjustment', 'provider_clearing', 'credit'),
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
    async verifyOrder(orderId, exec = this.db) {
        const [b, unbalanced] = await Promise.all([
            this.balances(orderId, exec),
            exec.execute(sql `
        select t.id from ledger_transactions t join ledger_entries e on e.transaction_id = t.id
        where t.order_id = ${orderId} group by t.id
        having sum(case e.direction when 'debit' then e.amount_cents else -e.amount_cents end) <> 0`),
        ]);
        const problems = [];
        if (b.providerClearing !== b.paidCents + b.exchangeReceivedCents - b.refundedCents - b.chargebackCents - b.exchangeRefundedCents - b.providerFeeCents)
            problems.push('provider_clearing diferente de pago - estornado - tarifa (e taxa de troca recebida - devolvida)');
        if (b.refundedCents + b.chargebackCents > b.paidCents)
            problems.push('estornado maior que o pago');
        if (unbalanced.rows.length > 0)
            problems.push('lançamento que não fecha');
        return { ok: problems.length === 0, problems };
    }
    /** Pedidos com lançamento que não fecha: o relatório de conciliação interna (WB-157). */
    async unbalancedOrders(orderIds, exec = this.db) {
        const bad = [];
        for (const id of orderIds)
            if (!(await this.verifyOrder(id, exec)).ok)
                bad.push(id);
        return bad;
    }
};
LedgerService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], LedgerService);
export { LedgerService };
//# sourceMappingURL=ledger.service.js.map