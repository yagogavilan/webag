import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { ParametersService } from '../admin/index.js';
import { orders } from '../orders/db/schema.js';
import { PAID_STATUSES } from '../orders/domain/state.js';

const money = (amount: number) => ({ amount, currency: 'BRL' as const });
/** Dia civil de Brasília: `from` e `to` inclusivos (o fim vira o início do dia seguinte). */
export const dayStart = (day: string): Date => new Date(`${day}T00:00:00-03:00`);
export const dayAfter = (day: string): Date => new Date(dayStart(day).getTime() + 86_400_000);

export type PayoutStatus = 'pending' | 'in_grace' | 'released';
export interface StatementLine {
  orderId: string;
  number: string;
  paidAt: string;
  orderStatus: string;
  gross: ReturnType<typeof money>;
  commission: ReturnType<typeof money>;
  providerFee: ReturnType<typeof money>;
  refunds: ReturnType<typeof money>;
  net: ReturnType<typeof money>;
  payoutStatus: PayoutStatus;
}

/**
 * Financeiro da loja (RN-10, RN-13). "Vendas" = itens menos cupom da loja (a taxa de entrega e a de serviço são da Webag e não
 * entram). Comissão, tarifa do provedor, estornos e líquido vêm do LEDGER (a fonte da verdade), não de campos soltos do pedido.
 * Em split o dinheiro cai direto na conta do lojista e a liberação segue o provedor: `payoutStatus` é INFORMATIVO (a Webag não
 * retém nem repassa, DEC-016): `pending` = pedido ainda não entregue, `in_grace` = entregue há menos de `repasse_carencia_dias`,
 * `released` = passou a carência.
 */
@Injectable()
export class StoreFinanceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
  ) {}

  private paid = sql`${orders.status} in (${sql.join(PAID_STATUSES.map((s) => sql`${s}`), sql`, `)}) and ${orders.paidAt} is not null`;
  /** Extrato e resumo (I6): todo pedido pago no período, também o cancelado depois (a tarifa do provedor não volta e entra no líquido). */
  private everPaid = sql`${orders.paidAt} is not null`;

  /** Vendas do período sem comissão nem líquido: vale para quem tem `sales_values` (funcionário com permissão). */
  async sales(storeId: string, from: string, to: string) {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int`, gross: sql<number>`coalesce(sum(${orders.subtotalCents} - ${orders.storeCouponCents}), 0)::int` })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), this.paid, gte(orders.paidAt, dayStart(from)), lt(orders.paidAt, dayAfter(to))));
    const n = row?.n ?? 0;
    const gross = row?.gross ?? 0;
    return { period: { from, to }, orders: n, gross: money(gross), averageTicket: money(n === 0 ? 0 : Math.round(gross / n)) };
  }

  /**
   * W.6: ranking dos mais vendidos do período (Início do lojista): por produto, unidades e "você recebe" (a parte do líquido do pedido, antes da
   * tarifa do provedor, proporcional à participação do item no subtotal: itens - cupom da loja - comissão, DEC-036a). Mesmos pedidos de `sales`
   * (pagos e não cancelados, por data de pagamento). Nome e imagem são os da venda mais recente (o item é snapshot).
   */
  async topProducts(storeId: string, from: string, to: string, limit: number) {
    const res = await this.db.execute<{ product_id: string; name: string; image: Record<string, string> | null; units: number; receive: number }>(sql`
      select oi.product_id, (array_agg(oi.name order by o.paid_at desc))[1] as name, (array_agg(oi.image order by o.paid_at desc))[1] as image,
             sum(oi.quantity)::int as units,
             round(sum(oi.line_total_cents::numeric * coalesce((o.finance->>'merchantNetBeforeProviderFeeCents')::numeric, o.subtotal_cents - o.store_coupon_cents) / nullif(o.subtotal_cents, 0)))::int as receive
      from order_items oi
      join orders o on o.id = oi.order_id
      where o.store_id = ${storeId}::uuid and o.paid_at is not null
        and o.status in (${sql.join(PAID_STATUSES.map((st) => sql`${st}`), sql`, `)})
        and o.paid_at >= ${dayStart(from).toISOString()}::timestamptz and o.paid_at < ${dayAfter(to).toISOString()}::timestamptz
      group by oi.product_id
      order by units desc, receive desc, name
      limit ${limit}`);
    return { period: { from, to }, data: res.rows.map((r) => ({ productId: r.product_id, name: r.name, image: { urls: r.image ?? {} }, units: r.units, youReceive: money(r.receive ?? 0) })) };
  }

  /**
   * Série de vendas por dia civil de Brasília para o gráfico do painel: um ponto por dia do período (dia sem venda = zero), com a
   * MESMA definição de "vendas" do resumo (itens menos cupom da loja, pedidos pagos por data de pagamento). A soma da série é igual
   * ao `sales` do mesmo período.
   */
  async salesDaily(storeId: string, from: string, to: string) {
    const res = await this.db.execute<{ date: string; orders: number; gross: number }>(sql`
      with days as (select generate_series(${from}::date, ${to}::date, interval '1 day')::date as d)
      select to_char(days.d, 'YYYY-MM-DD') as date, count(o.id)::int as orders, coalesce(sum(o.subtotal_cents - o.store_coupon_cents), 0)::int as gross
      from days
      left join orders o on o.store_id = ${storeId}::uuid and o.paid_at is not null
        and o.status in (${sql.join(PAID_STATUSES.map((st) => sql`${st}`), sql`, `)})
        and (o.paid_at at time zone 'America/Sao_Paulo')::date = days.d
      group by days.d order by days.d`);
    return {
      period: { from, to },
      timezone: 'America/Sao_Paulo',
      data: res.rows.map((r) => ({ date: r.date, orders: r.orders, gross: money(r.gross) })),
    };
  }

  /** Visão do dono: vendas, comissão, tarifa do provedor, estornos, líquido e o que ainda está para entrar. */
  async summary(storeId: string, from: string, to: string) {
    const start = dayStart(from).toISOString();
    const end = dayAfter(to).toISOString();
    const carencia = await this.params.getNumber('repasse_carencia_dias');
    const [sales, ledger, receivable] = await Promise.all([
      this.sales(storeId, from, to),
      // I6: UMA definição de "líquido da loja" (a mesma do extrato e do a receber): tudo que o ledger lançou em `merchant_payable`
      // dos pedidos PAGOS no período (por data de pagamento, qualquer estado atual, inclusive cancelado), de qualquer tipo de lançamento.
      this.db.execute(sql`
        select t.kind, e.account, e.direction, coalesce(sum(e.amount_cents), 0)::int as total
        from orders o
        join ledger_transactions t on t.order_id = o.id
        join ledger_entries e on e.transaction_id = t.id
        where o.store_id = ${storeId}::uuid and o.paid_at is not null and o.paid_at >= ${start}::timestamptz and o.paid_at < ${end}::timestamptz
        group by t.kind, e.account, e.direction`),
      this.db.execute(sql`
        with net as (
          select t.order_id, sum(case when e.direction = 'credit' then e.amount_cents else -e.amount_cents end)::int as net
          from ledger_transactions t join ledger_entries e on e.transaction_id = t.id and e.account = 'merchant_payable'
          where t.store_id = ${storeId}::uuid group by t.order_id)
        select case when o.status <> 'delivered' then 'pending'
                    when o.delivered_at > now() - make_interval(days => ${carencia}::int) then 'in_grace' else 'released' end as bucket,
               coalesce(sum(n.net), 0)::int as total, count(*)::int as orders
        from net n join orders o on o.id = n.order_id
        where n.net <> 0 group by 1`),
    ]);
    const receivableRows = receivable.rows as { bucket: PayoutStatus; total: number; orders: number }[];
    const sum = (kind: string, account: string, direction: 'debit' | 'credit'): number =>
      (ledger.rows as { kind: string; account: string; direction: string; total: number }[]).filter((r) => r.kind === kind && r.account === account && r.direction === direction).reduce((a, r) => a + r.total, 0);
    const commissionCharged = sum('sale', 'commission_revenue', 'credit');
    const returnKinds = ['refund', 'coverage', 'adjustment'] as const; // `adjustment` = chargeback (I2)
    const commissionReturned = returnKinds.reduce((a, kind) => a + sum(kind, 'commission_revenue', 'debit'), 0);
    const providerFees = sum('provider_fee', 'merchant_payable', 'debit');
    const refunded = sum('refund', 'provider_clearing', 'credit') + sum('adjustment', 'provider_clearing', 'credit');
    const kinds = [...new Set((ledger.rows as { kind: string }[]).map((r) => r.kind))];
    const net = kinds.reduce((a, kind) => a + sum(kind, 'merchant_payable', 'credit') - sum(kind, 'merchant_payable', 'debit'), 0);
    const bucket = (name: PayoutStatus) => receivableRows.find((r) => r.bucket === name);
    return {
      period: { from, to },
      sales,
      commission: { charged: money(commissionCharged), returned: money(commissionReturned), net: money(commissionCharged - commissionReturned) },
      providerFees: money(providerFees),
      refunds: money(refunded),
      net: money(net),
      /** Informativo (split): o dinheiro cai na conta do Mercado Pago da loja, no prazo do provedor. */
      receivable: {
        informational: true,
        graceDays: carencia,
        pending: { orders: bucket('pending')?.orders ?? 0, amount: money(bucket('pending')?.total ?? 0) },
        inGrace: { orders: bucket('in_grace')?.orders ?? 0, amount: money(bucket('in_grace')?.total ?? 0) },
        released: { orders: bucket('released')?.orders ?? 0, amount: money(bucket('released')?.total ?? 0) },
      },
    };
  }

  /** Extrato por pedido (mais recentes primeiro), com paginação por cursor. */
  async statement(storeId: string, from: string, to: string, query: { cursor?: string | undefined; limit?: unknown }): Promise<Page<StatementLine>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.storeId, storeId), this.everPaid, gte(orders.paidAt, dayStart(from)), lt(orders.paidAt, dayAfter(to)), timestampCursorBefore(orders.paidAt, orders.id, cursor)))
      .orderBy(...timestampOrderDesc(orders.paidAt, orders.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return { data: await this.lines(page), nextCursor: rows.length > limit && last?.paidAt ? encodeCursor({ at: last.paidAt.toISOString(), id: last.id }) : null };
  }

  /** Até 5.000 linhas mais recentes, para exportar. */
  async statementAll(storeId: string, from: string, to: string, max = 5_000): Promise<StatementLine[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.storeId, storeId), this.everPaid, gte(orders.paidAt, dayStart(from)), lt(orders.paidAt, dayAfter(to))))
      .orderBy(...timestampOrderDesc(orders.paidAt, orders.id))
      .limit(max);
    return this.lines(rows);
  }

  private async lines(page: (typeof orders.$inferSelect)[]): Promise<StatementLine[]> {
    if (page.length === 0) return [];
    const carencia = await this.params.getNumber('repasse_carencia_dias');
    const result = await this.db.execute(sql`
      select t.order_id,
             coalesce(sum(case when t.kind = 'provider_fee' and e.account = 'merchant_payable' and e.direction = 'debit' then e.amount_cents else 0 end), 0)::int as provider_fee,
             coalesce(sum(case when t.kind in ('refund', 'adjustment') and e.account = 'provider_clearing' and e.direction = 'credit' then e.amount_cents else 0 end), 0)::int as refunded,
             coalesce(sum(case when e.account = 'merchant_payable' then (case when e.direction = 'credit' then 1 else -1 end) * e.amount_cents else 0 end), 0)::int as net
      from ledger_transactions t join ledger_entries e on e.transaction_id = t.id
      where t.order_id in (${sql.join(page.map((o) => sql`${o.id}::uuid`), sql`, `)})
      group by t.order_id`);
    const byOrder = new Map((result.rows as { order_id: string; provider_fee: number; refunded: number; net: number }[]).map((r) => [r.order_id, r]));
    const graceMs = carencia * 86_400_000;
    return page.map((o) => {
      const l = byOrder.get(o.id);
      const payoutStatus: PayoutStatus = o.status !== 'delivered' || !o.deliveredAt ? 'pending' : Date.now() - o.deliveredAt.getTime() < graceMs ? 'in_grace' : 'released';
      return {
        orderId: o.id,
        number: o.number,
        paidAt: o.paidAt!.toISOString(),
        orderStatus: o.status,
        gross: money(o.subtotalCents - o.storeCouponCents),
        commission: money(o.commissionCents),
        providerFee: money(l?.provider_fee ?? 0),
        refunds: money(l?.refunded ?? 0),
        net: money(l?.net ?? 0),
        payoutStatus,
      };
    });
  }
}

