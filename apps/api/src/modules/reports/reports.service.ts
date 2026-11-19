import { CSV_BOM, csvCell, csvLine } from '../../platform/http/csv.js';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { alertKindInfo } from '../admin/index.js';

export interface ReportFilters {
  from: string;
  to: string;
  cityId?: string | undefined;
  storeId?: string | undefined;
  categoryId?: string | undefined;
}

const money = (amount: number) => ({ amount, currency: 'BRL' as const });
/** Dia civil de Brasília: `from` e `to` inclusivos. */
const dayStart = (day: string): Date => new Date(`${day}T00:00:00-03:00`);
const dayAfter = (day: string): Date => new Date(dayStart(day).getTime() + 86_400_000);
const DAY = 86_400_000;
export const CSV_MAX_ROWS = 10_000;

interface Range {
  start: Date;
  end: Date;
}

/**
 * WB-122: relatórios operacionais do admin, com as definições da RN-15:
 *  - pedido "que chegou a RECEBIDO" = tem `paid_at`; a data do pedido é a do PAGAMENTO (dia de Brasília);
 *  - GMV = `total_cents` dos que chegaram a RECEBIDO, exceto cancelados, recusados e expirados; GMV concluído = só ENTREGUE;
 *  - ticket médio = GMV concluído / pedidos ENTREGUE;
 *  - cancelamento = (CANCELADO + RECUSADO) / pedidos que chegaram a RECEBIDO, por ator e motivo;
 *  - recompra = % de clientes com 2+ pedidos ENTREGUE em 30 dias após o primeiro (coorte do período, só coortes com 30 dias completos);
 *  - novas lojas = aprovadas no período; novos clientes = cadastros de cliente no período.
 * A receita Webag e a comissão saem do LEDGER (fonte da verdade) para o mesmo filtro, e batem com a soma dos pedidos. Sem dado pessoal.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  private range(f: ReportFilters): Range {
    return { start: dayStart(f.from), end: dayAfter(f.to) };
  }

  /** Filtros de pedido: cidade (da loja), loja e categoria (algum item da categoria ou de uma filha). */
  private orderFilter(f: ReportFilters): SQL {
    const parts: SQL[] = [];
    if (f.storeId) parts.push(sql`and o.store_id = ${f.storeId}::uuid`);
    if (f.cityId) parts.push(sql`and s.address_city_id = ${f.cityId}::uuid`);
    if (f.categoryId) {
      parts.push(sql`and exists (select 1 from order_items oi join categories c on c.id = oi.category_id where oi.order_id = o.id and (c.id = ${f.categoryId}::uuid or c.parent_id = ${f.categoryId}::uuid))`);
    }
    return sql.join(parts, sql` `);
  }

  private validate(f: ReportFilters): void {
    const days = (dayStart(f.to).getTime() - dayStart(f.from).getTime()) / DAY;
    if (days < 0 || days > 366) throw errors.validation([{ field: 'to', message: 'Período de no máximo 366 dias, com o início antes do fim.' }]);
  }

  private async core(f: ReportFilters, range: Range) {
    const filter = this.orderFilter(f);
    const res = await this.db.execute<{
      reached: number; cancelled: number; refused: number; gmv: number; gmv_done: number; delivered: number;
      commission: number; service_fee: number; delivery_fee: number; platform_discount: number; application_fee: number;
    }>(sql`
      select count(*)::int as reached,
        count(*) filter (where o.status = 'cancelled')::int as cancelled,
        count(*) filter (where o.status = 'refused')::int as refused,
        coalesce(sum(o.total_cents) filter (where o.status not in ('cancelled', 'refused', 'expired')), 0)::int as gmv,
        coalesce(sum(o.total_cents) filter (where o.status = 'delivered'), 0)::int as gmv_done,
        count(*) filter (where o.status = 'delivered')::int as delivered,
        coalesce(sum(o.commission_cents) filter (where o.status not in ('cancelled', 'refused', 'expired')), 0)::int as commission,
        coalesce(sum(o.service_fee_cents) filter (where o.status not in ('cancelled', 'refused', 'expired')), 0)::int as service_fee,
        coalesce(sum(o.delivery_fee_cents) filter (where o.status not in ('cancelled', 'refused', 'expired')), 0)::int as delivery_fee,
        coalesce(sum(o.platform_discount_cents) filter (where o.status not in ('cancelled', 'refused', 'expired')), 0)::int as platform_discount,
        coalesce(sum(o.application_fee_cents) filter (where o.status not in ('cancelled', 'refused', 'expired')), 0)::int as application_fee
      from orders o join stores s on s.id = o.store_id
      where o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}`);
    const r = res.rows[0]!;

    const stores = await this.db.execute<{ n: number }>(sql`
      select count(*)::int as n from stores s
      where s.approved_at >= ${range.start.toISOString()}::timestamptz and s.approved_at < ${range.end.toISOString()}::timestamptz
        ${f.cityId ? sql`and s.address_city_id = ${f.cityId}::uuid` : sql``}
        ${f.storeId ? sql`and s.id = ${f.storeId}::uuid` : sql``}
        ${f.categoryId ? sql`and (s.main_category_id = ${f.categoryId}::uuid or s.main_category_id in (select id from categories where parent_id = ${f.categoryId}::uuid))` : sql``}`);
    const customers = await this.db.execute<{ n: number }>(sql`
      select count(*)::int as n from users u
      where u.created_at >= ${range.start.toISOString()}::timestamptz and u.created_at < ${range.end.toISOString()}::timestamptz
        and exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'customer')
        and not exists (select 1 from admin_profiles ap where ap.user_id = u.id)
        ${f.cityId ? sql`and exists (select 1 from user_addresses a where a.user_id = u.id and a.city_id = ${f.cityId}::uuid)` : sql``}`);
    const reached = r.reached;
    return {
      orders: reached,
      gmvCents: r.gmv,
      gmvDeliveredCents: r.gmv_done,
      deliveredOrders: r.delivered,
      averageTicketCents: r.delivered === 0 ? 0 : Math.round(r.gmv_done / r.delivered),
      newStores: stores.rows[0]?.n ?? 0,
      newCustomers: customers.rows[0]?.n ?? 0,
      cancelledOrders: r.cancelled + r.refused,
      cancellationRatePct: reached === 0 ? 0 : Math.round(((r.cancelled + r.refused) * 1000) / reached) / 10,
      revenue: { commissionCents: r.commission, serviceFeeCents: r.service_fee, deliveryFeeCents: r.delivery_fee, platformDiscountCents: r.platform_discount, applicationFeeCents: r.application_fee },
    };
  }

  /** Recompra em 30 dias (RN-15): coorte = clientes cujo 1º pedido ENTREGUE caiu no período E já passaram 30 dias dele. */
  private async repurchase(f: ReportFilters, range: Range) {
    const res = await this.db.execute<{ cohort: number; repeated: number }>(sql`
      with firsts as (
        select o.user_id, min(o.delivered_at) as first_at from orders o where o.status = 'delivered' and o.delivered_at is not null group by o.user_id),
      cohort as (
        select f.user_id, f.first_at from firsts f
        where f.first_at >= ${range.start.toISOString()}::timestamptz and f.first_at < ${range.end.toISOString()}::timestamptz
          and f.first_at <= now() - interval '30 days'
          ${f.cityId ? sql`and exists (select 1 from user_addresses a where a.user_id = f.user_id and a.city_id = ${f.cityId}::uuid)` : sql``}
          ${f.storeId ? sql`and exists (select 1 from orders o where o.user_id = f.user_id and o.status = 'delivered' and o.delivered_at = f.first_at and o.store_id = ${f.storeId}::uuid)` : sql``})
      select count(*)::int as cohort,
        count(*) filter (where exists (select 1 from orders o2 where o2.user_id = cohort.user_id and o2.status = 'delivered' and o2.delivered_at > cohort.first_at and o2.delivered_at <= cohort.first_at + interval '30 days'))::int as repeated
      from cohort`);
    const row = res.rows[0] ?? { cohort: 0, repeated: 0 };
    return { cohort: row.cohort, repurchased: row.repeated, ratePct: row.cohort === 0 ? null : Math.round((row.repeated * 1000) / row.cohort) / 10 };
  }

  async operations(f: ReportFilters) {
    this.validate(f);
    const range = this.range(f);
    const length = range.end.getTime() - range.start.getTime();
    const previousRange = { start: new Date(range.start.getTime() - length), end: range.start };
    const previousFilters = { ...f, from: new Date(previousRange.start.getTime() - 3 * 3_600_000).toISOString().slice(0, 10), to: new Date(previousRange.end.getTime() - 1 - 3 * 3_600_000).toISOString().slice(0, 10) };
    const [current, previous, repurchase, series, cancellations, ledger] = await Promise.all([
      this.core(f, range),
      this.core(previousFilters, previousRange),
      this.repurchase(f, range),
      this.series(f, range),
      this.cancellations(f, range),
      this.ledgerRevenue(f, range),
    ]);
    const delta = (now: number, before: number): number | null => (before === 0 ? null : Math.round(((now - before) * 1000) / before) / 10);
    return {
      period: { from: f.from, to: f.to },
      timezone: 'America/Sao_Paulo',
      empty: current.orders === 0 && current.newStores === 0 && current.newCustomers === 0,
      kpis: {
        orders: current.orders,
        gmv: money(current.gmvCents),
        gmvDelivered: money(current.gmvDeliveredCents),
        deliveredOrders: current.deliveredOrders,
        averageTicket: money(current.averageTicketCents),
        newStores: current.newStores,
        newCustomers: current.newCustomers,
        repurchase,
        cancelledOrders: current.cancelledOrders,
        cancellationRatePct: current.cancellationRatePct,
      },
      /** Mesma duração, logo antes do período: o app mostra "+12% vs. período anterior". `null` quando o anterior é zero. */
      variation: {
        ordersPct: delta(current.orders, previous.orders),
        gmvPct: delta(current.gmvCents, previous.gmvCents),
        gmvDeliveredPct: delta(current.gmvDeliveredCents, previous.gmvDeliveredCents),
        averageTicketPct: delta(current.averageTicketCents, previous.averageTicketCents),
        newStoresPct: delta(current.newStores, previous.newStores),
        newCustomersPct: delta(current.newCustomers, previous.newCustomers),
      },
      revenue: {
        // Dos pedidos (snapshot) e do LEDGER para o mesmo filtro: precisam fechar (WB-114 C2).
        orders: { commission: money(current.revenue.commissionCents), serviceFee: money(current.revenue.serviceFeeCents), deliveryFee: money(current.revenue.deliveryFeeCents), platformDiscount: money(current.revenue.platformDiscountCents), applicationFee: money(current.revenue.applicationFeeCents) },
        ledger: { commission: money(ledger.commissionCents), serviceFee: money(ledger.serviceFeeCents), deliveryFee: money(ledger.deliveryFeeCents), platformPromoExpense: money(ledger.promoCents) },
      },
      series,
      cancellations,
    };
  }

  /** Receita do ledger (vendas menos devoluções) dos pedidos do filtro: conta de receita = créditos - débitos. */
  private async ledgerRevenue(f: ReportFilters, range: Range) {
    const filter = this.orderFilter(f);
    const res = await this.db.execute<{ account: string; net: number }>(sql`
      select e.account, coalesce(sum(case when e.direction = 'credit' then e.amount_cents else -e.amount_cents end), 0)::int as net
      from ledger_transactions t
      join ledger_entries e on e.transaction_id = t.id
      join orders o on o.id = t.order_id
      join stores s on s.id = o.store_id
      where t.kind in ('sale', 'refund') and e.account in ('commission_revenue', 'service_fee_revenue', 'delivery_fee_revenue', 'platform_promo_expense')
        and o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}
      group by e.account`);
    const net = (account: string) => res.rows.find((r) => r.account === account)?.net ?? 0;
    // `platform_promo_expense` é despesa (débito): invertida para sair positiva como "custo do cupom da plataforma".
    return { commissionCents: net('commission_revenue'), serviceFeeCents: net('service_fee_revenue'), deliveryFeeCents: net('delivery_fee_revenue'), promoCents: -net('platform_promo_expense') };
  }

  /** Pedidos e GMV por dia de Brasília (zero onde não houve), para o gráfico e a tabela alternativa. */
  private async series(f: ReportFilters, range: Range) {
    const filter = this.orderFilter(f);
    const res = await this.db.execute<{ date: string; orders: number; gmv: number }>(sql`
      with days as (select generate_series(${f.from}::date, ${f.to}::date, interval '1 day')::date as d)
      select to_char(days.d, 'YYYY-MM-DD') as date, count(o.id)::int as orders,
        coalesce(sum(o.total_cents) filter (where o.status not in ('cancelled', 'refused', 'expired')), 0)::int as gmv
      from days
      left join (select o.* from orders o join stores s on s.id = o.store_id
        where o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}) o
        on (o.paid_at at time zone 'America/Sao_Paulo')::date = days.d
      group by days.d order by days.d`);
    return res.rows.map((r) => ({ date: r.date, orders: r.orders, gmv: money(r.gmv) }));
  }

  /** Cancelamentos por QUEM e por MOTIVO (cliente, loja, sistema, admin). */
  private async cancellations(f: ReportFilters, range: Range) {
    const filter = this.orderFilter(f);
    const res = await this.db.execute<{ actor: string; reason: string | null; n: number; total: number }>(sql`
      select coalesce(o.cancelled_by, case when o.status = 'refused' then 'store' else 'system' end) as actor, o.cancel_reason as reason, count(*)::int as n, coalesce(sum(o.total_cents), 0)::int as total
      from orders o join stores s on s.id = o.store_id
      where o.status in ('cancelled', 'refused') and o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}
      group by 1, 2 order by n desc, actor`);
    return res.rows.map((r) => ({ actor: r.actor, reason: r.reason ?? 'Sem motivo informado', orders: r.n, value: money(r.total) }));
  }

  // ------------------------------------------------------------------ lista (o "Ver os N pedidos deste filtro")

  private async orderRows(f: ReportFilters, status: string | undefined, cursor: { at: string; id: string } | null, limit: number) {
    const range = this.range(f);
    const filter = this.orderFilter(f);
    return this.db.execute<{
      id: string; number: string; store_id: string; store_name: string | null; status: string; mode: string; total: number; subtotal: number; delivery_fee: number; service_fee: number; discount: number; commission: number; paid_at: Date; delivered_at: Date | null; cancelled_by: string | null; cancel_reason: string | null;
    }>(sql`
      select o.id, o.number, o.store_id, s.name as store_name, o.status, o.mode, o.total_cents as total, o.subtotal_cents as subtotal, o.delivery_fee_cents as delivery_fee, o.service_fee_cents as service_fee,
        o.discount_cents as discount, o.commission_cents as commission, o.paid_at, o.delivered_at, o.cancelled_by, o.cancel_reason
      from orders o join stores s on s.id = o.store_id
      where o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}
        ${status ? sql`and o.status = ${status}` : sql``}
        ${cursor ? sql`and (o.paid_at, o.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql``}
      order by o.paid_at desc, o.id desc limit ${limit}`);
  }

  async orders(f: ReportFilters & { status?: string | undefined; cursor?: string | undefined; limit?: unknown }) {
    this.validate(f);
    const limit = parseLimit(f.limit);
    const rows = (await this.orderRows(f, f.status, decodeCursor<{ at: string; id: string }>(f.cursor), limit + 1)).rows;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      data: page.map((r) => ({ id: r.id, number: r.number, store: { id: r.store_id, name: r.store_name }, status: r.status, mode: r.mode, total: money(r.total), commission: money(r.commission), paidAt: new Date(r.paid_at).toISOString(), deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null, cancelledBy: r.cancelled_by, cancelReason: r.cancel_reason })),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: new Date(last.paid_at).toISOString(), id: last.id }) : null,
    };
  }

  /** CSV com os MESMOS números (até 10.000 linhas; acima, 422 pedindo filtro menor). Fórmulas de planilha são neutralizadas. */
  async ordersCsv(f: ReportFilters & { status?: string | undefined }): Promise<{ csv: string; rows: number }> {
    this.validate(f);
    const rows = (await this.orderRows(f, f.status, null, CSV_MAX_ROWS + 1)).rows;
    if (rows.length > CSV_MAX_ROWS) throw errors.unprocessable('EXPORT_TOO_LARGE', 'A exportação é grande demais', { detail: `Mais de ${CSV_MAX_ROWS} pedidos neste filtro. Reduza o período ou filtre por loja.` });
    const reais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
    const header = ['pedido', 'loja', 'status', 'modo', 'pago_em', 'entregue_em', 'subtotal', 'taxa_entrega', 'taxa_servico', 'desconto', 'total', 'comissao', 'cancelado_por', 'motivo'];
    const lines = rows.map((r) => [csvCell(r.number), csvCell(r.store_name ?? ''), csvCell(r.status), csvCell(r.mode), new Date(r.paid_at).toISOString(), r.delivered_at ? new Date(r.delivered_at).toISOString() : '', reais(r.subtotal), reais(r.delivery_fee), reais(r.service_fee), reais(r.discount), reais(r.total), reais(r.commission), csvCell(r.cancelled_by ?? ''), csvCell(r.cancel_reason ?? '')].join(';'));
    return { csv: `${String.fromCharCode(0xfeff)}${[header.join(';'), ...lines].join('\r\n')}\r\n`, rows: rows.length };
  }

  /** CSV dos KPIs do período (uma linha por indicador), auditado por quem chama. */
  async operationsCsv(f: ReportFilters): Promise<string> {
    const r = await this.operations(f);
    const reais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
    const k = r.kpis;
    const lines = [
      ['indicador', 'valor'],
      ['periodo', `${f.from} a ${f.to}`],
      ['pedidos', String(k.orders)],
      ['gmv', reais(k.gmv.amount)],
      ['gmv_concluido', reais(k.gmvDelivered.amount)],
      ['pedidos_entregues', String(k.deliveredOrders)],
      ['ticket_medio', reais(k.averageTicket.amount)],
      ['novas_lojas', String(k.newStores)],
      ['novos_clientes', String(k.newCustomers)],
      ['recompra_30d_pct', k.repurchase.ratePct === null ? '' : String(k.repurchase.ratePct).replace('.', ',')],
      ['cancelamentos', String(k.cancelledOrders)],
      ['taxa_cancelamento_pct', String(k.cancellationRatePct).replace('.', ',')],
      ...r.series.map((p) => [`dia_${p.date}_pedidos`, String(p.orders)]),
      ...r.cancellations.map((c) => [`cancelamento_${c.actor}_${c.reason}`, String(c.orders)]),
    ];
    // SEC-156: o motivo de cancelamento é texto livre do cliente; toda célula passa pelo `csvCell`.
    return `${CSV_BOM}${lines.map((l) => csvLine(l)).join('\r\n')}\r\n`;
  }

  // ------------------------------------------------------------------ CSV financeiros do piloto (WB-114, DT-060, DEC-060)

  /** Mais de `CSV_MAX_ROWS` linhas: 422 com a contagem encontrada (sem e-mail assíncrono na 1.0). */
  private tooLarge(found: number): never {
    throw errors.unprocessable('EXPORT_TOO_LARGE', 'Período grande demais', { detail: `Período grande demais. Reduza o intervalo (máximo ${CSV_MAX_ROWS} linhas). Encontradas: ${found}.`, extensions: { rows: found, maxRows: CSV_MAX_ROWS } });
  }

  private financeFilter(f: ReportFilters): SQL {
    const parts: SQL[] = [];
    if (f.storeId) parts.push(sql`and s.id = ${f.storeId}::uuid`);
    if (f.cityId) parts.push(sql`and s.address_city_id = ${f.cityId}::uuid`);
    return sql.join(parts, sql` `);
  }

  /**
   * R1 "Receita por pedido": uma linha por pedido PAGO no período (data do pagamento, dia de Brasília): bruto, cupom da loja, cupom da plataforma,
   * comissão, taxa de entrega, taxa de serviço, `application_fee`, taxa do provedor, líquido da loja, estornos e status. Os valores do pedido
   * vêm do snapshot do pedido; taxa do provedor, líquido e estornos vêm do LEDGER (fonte da verdade, RN-10). Valores em reais (vírgula).
   */
  async revenueCsv(f: ReportFilters): Promise<{ csv: string; rows: number }> {
    this.validate(f);
    const range = this.range(f);
    const filter = this.financeFilter(f);
    const where = sql`o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}`;
    const [counted] = (await this.db.execute<{ n: number }>(sql`select count(*)::int as n from orders o join stores s on s.id = o.store_id where ${where}`)).rows;
    if ((counted?.n ?? 0) > CSV_MAX_ROWS) this.tooLarge(counted!.n);
    const res = await this.db.execute<{
      number: string; store_name: string | null; status: string; paid_at: Date | string; subtotal: number; store_coupon: number; platform_discount: number; commission: number; delivery_fee: number; service_fee: number; application_fee: number; total: number;
      provider_fee: number; merchant_net: number; refunded: number;
    }>(sql`
      select o.number, s.name as store_name, o.status, o.paid_at, o.subtotal_cents as subtotal, o.store_coupon_cents as store_coupon, o.platform_discount_cents as platform_discount, o.commission_cents as commission,
             o.delivery_fee_cents as delivery_fee, o.service_fee_cents as service_fee, o.application_fee_cents as application_fee, o.total_cents as total,
             l.provider_fee, l.merchant_net, l.refunded
      from orders o
      join stores s on s.id = o.store_id
      left join lateral (
        select coalesce(sum(case when t.kind = 'provider_fee' and e.account = 'provider_clearing' and e.direction = 'credit' then e.amount_cents end), 0)::int as provider_fee,
               coalesce(sum(case when t.kind in ('sale', 'provider_fee', 'refund', 'coverage', 'adjustment') and e.account = 'merchant_payable' then (case e.direction when 'credit' then e.amount_cents else -e.amount_cents end) end), 0)::int as merchant_net,
               coalesce(sum(case when t.kind in ('refund', 'coverage', 'adjustment') and e.account in ('provider_clearing', 'webag_coverage_cash') and e.direction = 'credit' then e.amount_cents end), 0)::int as refunded
        from ledger_transactions t join ledger_entries e on e.transaction_id = t.id where t.order_id = o.id
      ) l on true
      where ${where}
      order by o.paid_at, o.id limit ${CSV_MAX_ROWS}`);
    const reais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
    const header = ['pedido', 'loja', 'pago_em', 'status', 'bruto', 'cupom_loja', 'cupom_plataforma', 'comissao', 'taxa_entrega', 'taxa_servico', 'application_fee', 'taxa_provedor', 'liquido_lojista', 'estornos', 'total_pago'];
    const lines = res.rows.map((r) =>
      [csvCell(r.number), csvCell(r.store_name ?? ''), new Date(r.paid_at).toISOString(), csvCell(r.status), reais(r.subtotal), reais(r.store_coupon), reais(r.platform_discount), reais(r.commission), reais(r.delivery_fee), reais(r.service_fee), reais(r.application_fee), reais(r.provider_fee), reais(r.merchant_net), reais(r.refunded), reais(r.total)].join(';'),
    );
    return { csv: `${CSV_BOM}${[header.join(';'), ...lines].join('\r\n')}\r\n`, rows: res.rows.length };
  }

  /**
   * R2 "Estornos": uma linha por estorno (intenção de estorno que não falhou) pedido no período, com o valor, o meio, o motivo, o ator e o andamento
   * (`pending`, `done`, `exhausted`, `covered`). Inclui os da troca (referência `exchange:...`). Valores em reais (vírgula).
   */
  async refundsCsv(f: ReportFilters): Promise<{ csv: string; rows: number }> {
    this.validate(f);
    const range = this.range(f);
    const filter = this.financeFilter(f);
    const from = sql`
      from payment_refund_intents i
      join payment_attempts a on a.id = i.attempt_id
      left join orders o on o.id::text = a.external_reference
      left join exchange_requests ex on ('exchange:' || ex.id::text) = a.external_reference
      left join orders xo on xo.id = ex.order_id
      left join stores s on s.id = coalesce(a.store_id, o.store_id, ex.store_id)
      where i.status <> 'failed' and i.created_at >= ${range.start.toISOString()}::timestamptz and i.created_at < ${range.end.toISOString()}::timestamptz ${filter}`;
    const [counted] = (await this.db.execute<{ n: number }>(sql`select count(*)::int as n ${from}`)).rows;
    if ((counted?.n ?? 0) > CSV_MAX_ROWS) this.tooLarge(counted!.n);
    const res = await this.db.execute<{ order_number: string | null; exchange_number: string | null; store_name: string | null; created_at: Date | string; amount: number; method: string; reason: string; status: string; actor_role: string | null; actor_id: string | null }>(sql`
      select coalesce(o.number, xo.number) as order_number, ex.number as exchange_number, s.name as store_name, i.created_at, i.amount_cents as amount, a.method, i.reason, i.status, i.actor_role, i.actor_id
      ${from} order by i.created_at, i.id limit ${CSV_MAX_ROWS}`);
    const reais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
    const header = ['pedido', 'troca', 'loja', 'estornado_em', 'valor', 'meio', 'motivo', 'situacao', 'ator', 'ator_id'];
    const lines = res.rows.map((r) => [csvCell(r.order_number ?? ''), csvCell(r.exchange_number ?? ''), csvCell(r.store_name ?? ''), new Date(r.created_at).toISOString(), reais(r.amount), csvCell(r.method), csvCell(r.reason), csvCell(r.status), csvCell(r.actor_role ?? 'system'), csvCell(r.actor_id ?? '')].join(';'));
    return { csv: `${CSV_BOM}${[header.join(';'), ...lines].join('\r\n')}\r\n`, rows: res.rows.length };
  }

  // ------------------------------------------------------------------ pendências do Início do admin (W.7, WB-125)

  /**
   * Contagens de pendências por área para a visão geral e para os contadores da barra. Cada área só é calculada se o perfil tem a permissão dela
   * (`allowed`); as outras voltam nulas, para o painel não mostrar número que a pessoa não pode abrir. Só contagens: nenhum dado pessoal.
   *  - lojas: em análise (`in_review`); disputas: trocas em mediação; estornos: recusados pelo provedor que esperam a operação (esgotados, ou
   *    com falha e ainda em nova tentativa), como a fila de estornos; titulares: pedidos LGPD abertos e quantos vencem em até 5 dias ou já venceram.
   */
  async pendingCounts(allowed: { stores: boolean; disputes: boolean; refunds: boolean; dataRequests: boolean; alerts?: { kinds: string[]; all: boolean } }) {
    const n = async (query: SQL): Promise<number> => ((await this.db.execute<{ n: number }>(query)).rows[0]?.n ?? 0);
    // B3: alertas de operação abertos que o perfil vê (a lista e o detalhe estão em /v1/admin/alerts).
    const alertScope = allowed.alerts;
    const alertKinds = alertScope && !alertScope.all ? alertScope.kinds : null;
    const alertsOpen = !alertScope ? null : alertKinds !== null && alertKinds.length === 0 ? { open: 0, critical: 0 } : await this.openAlerts(alertKinds);
    const [stores, disputes, refunds, requests] = await Promise.all([
      allowed.stores ? n(sql`select count(*)::int as n from stores where status = 'in_review'`) : null,
      allowed.disputes ? n(sql`select count(*)::int as n from exchange_requests where status = 'in_mediation'`) : null,
      allowed.refunds ? n(sql`select count(*)::int as n from payment_refund_intents where status = 'exhausted' or (status = 'pending' and failures > 0)`) : null,
      allowed.dataRequests ? this.db.execute<{ open: number; due_soon: number }>(sql`select count(*)::int as open, count(*) filter (where due_at <= now() + interval '5 days')::int as due_soon from privacy_requests where status <> 'answered'`) : null,
    ]);
    const request = requests?.rows[0];
    return {
      stores: stores === null ? null : { inReview: stores },
      disputes: disputes === null ? null : { inMediation: disputes },
      refunds: refunds === null ? null : { needingAction: refunds },
      dataRequests: request === undefined ? null : { open: request.open, dueSoon: request.due_soon },
      alerts: alertsOpen,
    };
  }

  /** `open` = alertas abertos dos tipos informados (`null` = todos, inclusive os desconhecidos); `critical` = os de gravidade crítica no catálogo. */
  private async openAlerts(kinds: string[] | null): Promise<{ open: number; critical: number }> {
    const rows = await this.db.execute<{ kind: string; n: number }>(
      kinds === null ? sql`select kind, count(*)::int as n from payment_alerts where resolved_at is null group by kind` : sql`select kind, count(*)::int as n from payment_alerts where resolved_at is null and kind in (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)}) group by kind`,
    );
    let open = 0;
    let critical = 0;
    for (const r of rows.rows) {
      open += r.n;
      if (alertKindInfo(r.kind).severity === 'critical') critical += r.n;
    }
    return { open, critical };
  }
}
