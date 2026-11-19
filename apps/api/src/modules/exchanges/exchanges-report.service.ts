import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { ParametersService } from '../admin/index.js';

export interface ReportQuery {
  from: string;
  to: string;
  storeId?: string | undefined;
  categoryId?: string | undefined;
  type?: 'withdrawal' | 'defect' | 'size_color' | undefined;
}

interface Row {
  id: string;
  store_id: string;
  store_name: string;
  type: string;
  status: string;
  resolution: string;
  auto_approved: boolean;
  fee_cents: number;
  fee_paid: boolean;
  has_chart: boolean;
  category_id: string | null;
  category_name: string | null;
  hours_to_complete: number | null;
}

const pct = (part: number, whole: number): number => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);
/** Dia civil de Brasília: `from` inclusivo, `to` inclusivo (vira o início do dia seguinte). */
const dayStart = (day: string): Date => new Date(`${day}T00:00:00-03:00`);
const dayAfter = (day: string): Date => new Date(dayStart(day).getTime() + 86_400_000);

/** Relatório de trocas por loja e categoria (WB-248; custos só para quem vê custos: super admin e financeiro). */
@Injectable()
export class ExchangesReportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
  ) {}

  async report(query: ReportQuery, canSeeCosts: boolean) {
    const from = dayStart(query.from);
    const to = dayAfter(query.to);
    const store = query.storeId ? sql`and e.store_id = ${query.storeId}::uuid` : sql``;
    const category = query.categoryId ? sql`and p.category_id = ${query.categoryId}::uuid` : sql``;
    const type = query.type ? sql`and e.type = ${query.type}` : sql``;
    const ordersStore = query.storeId ? sql`and o.store_id = ${query.storeId}::uuid` : sql``;
    const [exchangeRows, orderRows, costRows, alertPct] = await Promise.all([
      this.db.execute(sql`
        select e.id, e.store_id, s.name as store_name, e.type, e.status, e.resolution, e.auto_approved, e.fee_cents,
               (e.fee_paid_at is not null and e.status <> 'cancelled') as fee_paid,
               (p.size_chart is not null and length(trim(p.size_chart)) > 0) as has_chart,
               p.category_id, c.name as category_name,
               case when e.completed_at is not null then extract(epoch from (e.completed_at - e.created_at)) / 3600 end as hours_to_complete
        from exchange_requests e
        join order_items oi on oi.id = e.order_item_id
        join products p on p.id = oi.product_id
        join stores s on s.id = e.store_id
        left join categories c on c.id = p.category_id
        where e.created_at >= ${from.toISOString()}::timestamptz and e.created_at < ${to.toISOString()}::timestamptz ${store} ${category} ${type}`),
      this.db.execute(sql`
        select o.store_id, count(*)::int as n from orders o
        where o.status = 'delivered' and o.delivered_at >= ${from.toISOString()}::timestamptz and o.delivered_at < ${to.toISOString()}::timestamptz ${ordersStore}
        group by o.store_id`),
      canSeeCosts
        ? this.db.execute(sql`
            select coalesce(sum(d.cost_cents), 0)::int as cost, count(*)::int as runs, count(*) filter (where d.cost_cents is null)::int as without_cost
            from deliveries d join exchange_requests e on e.id = d.exchange_id
            join order_items oi on oi.id = e.order_item_id join products p on p.id = oi.product_id
            where e.created_at >= ${from.toISOString()}::timestamptz and e.created_at < ${to.toISOString()}::timestamptz and d.status <> 'cancelled' ${store} ${category} ${type}`)
        : Promise.resolve(null),
      this.params.getNumber('troca_taxa_alerta_pct'),
    ]);
    const rows = exchangeRows.rows as unknown as Row[];
    const delivered = new Map((orderRows.rows as unknown as { store_id: string; n: number }[]).map((r) => [r.store_id, r.n]));
    const deliveredTotal = [...delivered.values()].reduce((a, b) => a + b, 0);

    const byType = (list: Row[]) => ({ withdrawal: list.filter((r) => r.type === 'withdrawal').length, defect: list.filter((r) => r.type === 'defect').length, size_color: list.filter((r) => r.type === 'size_color').length });
    const completed = rows.filter((r) => r.status === 'completed');
    const sizeColor = rows.filter((r) => r.type === 'size_color');
    const hours = completed.map((r) => Number(r.hours_to_complete)).filter((h) => Number.isFinite(h));
    const feeRevenueCents = rows.filter((r) => r.fee_paid).reduce((sum, r) => sum + r.fee_cents, 0);
    const cost = canSeeCosts ? (costRows?.rows[0] as { cost: number; runs: number; without_cost: number }) : null;

    const storeIds = new Set([...rows.map((r) => r.store_id), ...(query.categoryId || query.type ? [] : [...delivered.keys()])]);
    const byStore = [...storeIds].map((storeId) => {
      const list = rows.filter((r) => r.store_id === storeId);
      const orders = delivered.get(storeId) ?? 0;
      const rate = pct(list.length, orders);
      return { storeId, storeName: list[0]?.store_name ?? null, deliveredOrders: orders, exchanges: list.length, ratePct: rate, alert: orders > 0 && rate > alertPct, byType: byType(list) };
    });
    const categoryIds = new Set(rows.map((r) => r.category_id ?? 'none'));
    const byCategory = [...categoryIds].map((id) => {
      const list = rows.filter((r) => (r.category_id ?? 'none') === id);
      const sc = list.filter((r) => r.type === 'size_color');
      return { categoryId: id === 'none' ? null : id, categoryName: list[0]?.category_name ?? null, exchanges: list.length, byType: byType(list), sizeColorWithSizeChart: sc.filter((r) => r.has_chart).length, sizeColorWithoutSizeChart: sc.filter((r) => !r.has_chart).length };
    });
    return {
      period: { from: query.from, to: query.to },
      totals: {
        deliveredOrders: deliveredTotal,
        exchanges: rows.length,
        ratePct: pct(rows.length, deliveredTotal),
        byType: byType(rows),
        sizeColorWithSizeChart: sizeColor.filter((r) => r.has_chart).length,
        sizeColorWithoutSizeChart: sizeColor.filter((r) => !r.has_chart).length,
        resolvedAsExchange: completed.filter((r) => r.resolution === 'replace').length,
        resolvedAsRefund: completed.filter((r) => r.resolution === 'refund').length,
        autoApproved: rows.filter((r) => r.auto_approved).length,
        mediations: rows.filter((r) => r.status === 'in_mediation').length,
        avgResolutionHours: hours.length === 0 ? null : Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10,
        alertThresholdPct: alertPct,
        ...(cost
          ? {
              feeRevenue: { amount: feeRevenueCents, currency: 'BRL' as const },
              logisticsCost: { amount: cost.cost, currency: 'BRL' as const },
              netLogisticsCost: { amount: cost.cost - feeRevenueCents, currency: 'BRL' as const },
              runsWithoutCost: cost.without_cost,
            }
          : {}),
      },
      byStore: byStore.sort((a, b) => b.ratePct - a.ratePct || b.exchanges - a.exchanges),
      byCategory,
    };
  }

  /** CSV por loja (separador `;` e vírgula decimal não: valores em centavos, sem ambiguidade). Começa com BOM para o Excel. */
  toCsv(report: Awaited<ReturnType<ExchangesReportService['report']>>): string {
    const header = ['loja_id', 'loja', 'pedidos_entregues', 'trocas', 'taxa_pct', 'alerta', 'arrependimento', 'defeito', 'tamanho_cor'];
    const lines = report.byStore.map((s) => [s.storeId, JSON.stringify(s.storeName ?? ''), s.deliveredOrders, s.exchanges, s.ratePct, s.alert ? 'sim' : 'nao', s.byType.withdrawal, s.byType.defect, s.byType.size_color].join(';'));
    return `﻿${[header.join(';'), ...lines].join('\r\n')}\r\n`;
  }
}
