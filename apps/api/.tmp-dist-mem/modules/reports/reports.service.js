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
import { CSV_BOM, csvCell, csvLine } from '../../platform/http/csv.js';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
const money = (amount) => ({ amount, currency: 'BRL' });
/** Dia civil de Brasília: `from` e `to` inclusivos. */
const dayStart = (day) => new Date(`${day}T00:00:00-03:00`);
const dayAfter = (day) => new Date(dayStart(day).getTime() + 86_400_000);
const DAY = 86_400_000;
export const CSV_MAX_ROWS = 10_000;
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
let ReportsService = class ReportsService {
    db;
    constructor(db) {
        this.db = db;
    }
    range(f) {
        return { start: dayStart(f.from), end: dayAfter(f.to) };
    }
    /** Filtros de pedido: cidade (da loja), loja e categoria (algum item da categoria ou de uma filha). */
    orderFilter(f) {
        const parts = [];
        if (f.storeId)
            parts.push(sql `and o.store_id = ${f.storeId}::uuid`);
        if (f.cityId)
            parts.push(sql `and s.address_city_id = ${f.cityId}::uuid`);
        if (f.categoryId) {
            parts.push(sql `and exists (select 1 from order_items oi join categories c on c.id = oi.category_id where oi.order_id = o.id and (c.id = ${f.categoryId}::uuid or c.parent_id = ${f.categoryId}::uuid))`);
        }
        return sql.join(parts, sql ` `);
    }
    validate(f) {
        const days = (dayStart(f.to).getTime() - dayStart(f.from).getTime()) / DAY;
        if (days < 0 || days > 366)
            throw errors.validation([{ field: 'to', message: 'Período de no máximo 366 dias, com o início antes do fim.' }]);
    }
    async core(f, range) {
        const filter = this.orderFilter(f);
        const res = await this.db.execute(sql `
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
        const r = res.rows[0];
        const stores = await this.db.execute(sql `
      select count(*)::int as n from stores s
      where s.approved_at >= ${range.start.toISOString()}::timestamptz and s.approved_at < ${range.end.toISOString()}::timestamptz
        ${f.cityId ? sql `and s.address_city_id = ${f.cityId}::uuid` : sql ``}
        ${f.storeId ? sql `and s.id = ${f.storeId}::uuid` : sql ``}
        ${f.categoryId ? sql `and (s.main_category_id = ${f.categoryId}::uuid or s.main_category_id in (select id from categories where parent_id = ${f.categoryId}::uuid))` : sql ``}`);
        const customers = await this.db.execute(sql `
      select count(*)::int as n from users u
      where u.created_at >= ${range.start.toISOString()}::timestamptz and u.created_at < ${range.end.toISOString()}::timestamptz
        and exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'customer')
        and not exists (select 1 from admin_profiles ap where ap.user_id = u.id)
        ${f.cityId ? sql `and exists (select 1 from user_addresses a where a.user_id = u.id and a.city_id = ${f.cityId}::uuid)` : sql ``}`);
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
    async repurchase(f, range) {
        const res = await this.db.execute(sql `
      with firsts as (
        select o.user_id, min(o.delivered_at) as first_at from orders o where o.status = 'delivered' and o.delivered_at is not null group by o.user_id),
      cohort as (
        select f.user_id, f.first_at from firsts f
        where f.first_at >= ${range.start.toISOString()}::timestamptz and f.first_at < ${range.end.toISOString()}::timestamptz
          and f.first_at <= now() - interval '30 days'
          ${f.cityId ? sql `and exists (select 1 from user_addresses a where a.user_id = f.user_id and a.city_id = ${f.cityId}::uuid)` : sql ``}
          ${f.storeId ? sql `and exists (select 1 from orders o where o.user_id = f.user_id and o.status = 'delivered' and o.delivered_at = f.first_at and o.store_id = ${f.storeId}::uuid)` : sql ``})
      select count(*)::int as cohort,
        count(*) filter (where exists (select 1 from orders o2 where o2.user_id = cohort.user_id and o2.status = 'delivered' and o2.delivered_at > cohort.first_at and o2.delivered_at <= cohort.first_at + interval '30 days'))::int as repeated
      from cohort`);
        const row = res.rows[0] ?? { cohort: 0, repeated: 0 };
        return { cohort: row.cohort, repurchased: row.repeated, ratePct: row.cohort === 0 ? null : Math.round((row.repeated * 1000) / row.cohort) / 10 };
    }
    async operations(f) {
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
        const delta = (now, before) => (before === 0 ? null : Math.round(((now - before) * 1000) / before) / 10);
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
    async ledgerRevenue(f, range) {
        const filter = this.orderFilter(f);
        const res = await this.db.execute(sql `
      select e.account, coalesce(sum(case when e.direction = 'credit' then e.amount_cents else -e.amount_cents end), 0)::int as net
      from ledger_transactions t
      join ledger_entries e on e.transaction_id = t.id
      join orders o on o.id = t.order_id
      join stores s on s.id = o.store_id
      where t.kind in ('sale', 'refund') and e.account in ('commission_revenue', 'service_fee_revenue', 'delivery_fee_revenue', 'platform_promo_expense')
        and o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}
      group by e.account`);
        const net = (account) => res.rows.find((r) => r.account === account)?.net ?? 0;
        // `platform_promo_expense` é despesa (débito): invertida para sair positiva como "custo do cupom da plataforma".
        return { commissionCents: net('commission_revenue'), serviceFeeCents: net('service_fee_revenue'), deliveryFeeCents: net('delivery_fee_revenue'), promoCents: -net('platform_promo_expense') };
    }
    /** Pedidos e GMV por dia de Brasília (zero onde não houve), para o gráfico e a tabela alternativa. */
    async series(f, range) {
        const filter = this.orderFilter(f);
        const res = await this.db.execute(sql `
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
    async cancellations(f, range) {
        const filter = this.orderFilter(f);
        const res = await this.db.execute(sql `
      select coalesce(o.cancelled_by, case when o.status = 'refused' then 'store' else 'system' end) as actor, o.cancel_reason as reason, count(*)::int as n, coalesce(sum(o.total_cents), 0)::int as total
      from orders o join stores s on s.id = o.store_id
      where o.status in ('cancelled', 'refused') and o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}
      group by 1, 2 order by n desc, actor`);
        return res.rows.map((r) => ({ actor: r.actor, reason: r.reason ?? 'Sem motivo informado', orders: r.n, value: money(r.total) }));
    }
    // ------------------------------------------------------------------ lista (o "Ver os N pedidos deste filtro")
    async orderRows(f, status, cursor, limit) {
        const range = this.range(f);
        const filter = this.orderFilter(f);
        return this.db.execute(sql `
      select o.id, o.number, o.store_id, s.name as store_name, o.status, o.mode, o.total_cents as total, o.subtotal_cents as subtotal, o.delivery_fee_cents as delivery_fee, o.service_fee_cents as service_fee,
        o.discount_cents as discount, o.commission_cents as commission, o.paid_at, o.delivered_at, o.cancelled_by, o.cancel_reason
      from orders o join stores s on s.id = o.store_id
      where o.paid_at >= ${range.start.toISOString()}::timestamptz and o.paid_at < ${range.end.toISOString()}::timestamptz ${filter}
        ${status ? sql `and o.status = ${status}` : sql ``}
        ${cursor ? sql `and (o.paid_at, o.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql ``}
      order by o.paid_at desc, o.id desc limit ${limit}`);
    }
    async orders(f) {
        this.validate(f);
        const limit = parseLimit(f.limit);
        const rows = (await this.orderRows(f, f.status, decodeCursor(f.cursor), limit + 1)).rows;
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
            data: page.map((r) => ({ id: r.id, number: r.number, store: { id: r.store_id, name: r.store_name }, status: r.status, mode: r.mode, total: money(r.total), commission: money(r.commission), paidAt: new Date(r.paid_at).toISOString(), deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null, cancelledBy: r.cancelled_by, cancelReason: r.cancel_reason })),
            nextCursor: rows.length > limit && last ? encodeCursor({ at: new Date(last.paid_at).toISOString(), id: last.id }) : null,
        };
    }
    /** CSV com os MESMOS números (até 10.000 linhas; acima, 422 pedindo filtro menor). Fórmulas de planilha são neutralizadas. */
    async ordersCsv(f) {
        this.validate(f);
        const rows = (await this.orderRows(f, f.status, null, CSV_MAX_ROWS + 1)).rows;
        if (rows.length > CSV_MAX_ROWS)
            throw errors.unprocessable('EXPORT_TOO_LARGE', 'A exportação é grande demais', { detail: `Mais de ${CSV_MAX_ROWS} pedidos neste filtro. Reduza o período ou filtre por loja.` });
        const reais = (cents) => (cents / 100).toFixed(2).replace('.', ',');
        const header = ['pedido', 'loja', 'status', 'modo', 'pago_em', 'entregue_em', 'subtotal', 'taxa_entrega', 'taxa_servico', 'desconto', 'total', 'comissao', 'cancelado_por', 'motivo'];
        const lines = rows.map((r) => [csvCell(r.number), csvCell(r.store_name ?? ''), csvCell(r.status), csvCell(r.mode), new Date(r.paid_at).toISOString(), r.delivered_at ? new Date(r.delivered_at).toISOString() : '', reais(r.subtotal), reais(r.delivery_fee), reais(r.service_fee), reais(r.discount), reais(r.total), reais(r.commission), csvCell(r.cancelled_by ?? ''), csvCell(r.cancel_reason ?? '')].join(';'));
        return { csv: `${String.fromCharCode(0xfeff)}${[header.join(';'), ...lines].join('\r\n')}\r\n`, rows: rows.length };
    }
    /** CSV dos KPIs do período (uma linha por indicador), auditado por quem chama. */
    async operationsCsv(f) {
        const r = await this.operations(f);
        const reais = (cents) => (cents / 100).toFixed(2).replace('.', ',');
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
};
ReportsService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], ReportsService);
export { ReportsService };
//# sourceMappingURL=reports.service.js.map