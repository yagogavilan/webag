import { csvCell } from '../../platform/http/csv.js';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { ParametersService } from '../admin/index.js';

export interface LogisticsReportQuery {
  from: string;
  to: string;
  cityId?: string | undefined;
  storeId?: string | undefined;
  courierId?: string | undefined;
  kind?: 'delivery' | 'exchange_pickup' | 'exchange_return' | undefined;
}

const BOM = String.fromCharCode(0xfeff);
/** Dia civil de Brasília: `from` inclusivo, `to` inclusivo (vira o início do dia seguinte). */
const dayStart = (day: string): Date => new Date(`${day}T00:00:00-03:00`);
const dayAfter = (day: string): Date => new Date(dayStart(day).getTime() + 86_400_000);
const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const avg = (values: (number | null)[]): number | null => {
  const list = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return list.length === 0 ? null : Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
};

interface Row {
  id: string;
  kind: string;
  status: string;
  city_id: string | null;
  city_name: string | null;
  fee_cents: number;
  cost_cents: number | null;
  fail_reason: string | null;
  to_assigned_min: number | null;
  to_collected_min: number | null;
  to_delivered_min: number | null;
}

/**
 * Relatórios de logística (WB-240): desempenho, margem (taxa cobrada menos custo pago ao motoboy), custo do subsídio de frete
 * grátis e "a pagar por motoboy". Lê as corridas do período (pela hora em que ficaram prontas); não conta corrida cancelada.
 * Os totais são a soma das linhas (C4): o mesmo conjunto alimenta totais, cidades e falhas.
 */
@Injectable()
export class LogisticsReportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
  ) {}

  private filters(query: LogisticsReportQuery) {
    return sql`${query.cityId ? sql`and d.city_id = ${query.cityId}::uuid` : sql``} ${query.storeId ? sql`and d.store_id = ${query.storeId}::uuid` : sql``} ${query.courierId ? sql`and d.courier_id = ${query.courierId}::uuid` : sql``} ${query.kind ? sql`and d.kind = ${query.kind}` : sql``}`;
  }

  async summary(query: LogisticsReportQuery) {
    const from = dayStart(query.from);
    const to = dayAfter(query.to);
    // "No prazo" = do pronto à entrega dentro do limite de atenção da fila (`logistica_alerta_entrega_min`) [HIPÓTESE: o PO ainda não definiu o prazo].
    const [rows, limitMin] = await Promise.all([
      this.db.execute(sql`
        select d.id, d.kind, d.status, d.city_id, c.name as city_name, d.fee_cents, d.cost_cents, d.fail_reason,
               extract(epoch from ((select min(e.created_at) from delivery_events e where e.delivery_id = d.id and e.to_status = 'awaiting_courier') - d.ready_at)) / 60 as to_assigned_min,
               extract(epoch from ((select min(e.created_at) from delivery_events e where e.delivery_id = d.id and e.to_status = 'out_for_delivery') - d.ready_at)) / 60 as to_collected_min,
               extract(epoch from ((select min(e.created_at) from delivery_events e where e.delivery_id = d.id and e.to_status = 'delivered') - d.ready_at)) / 60 as to_delivered_min
        from deliveries d left join cities c on c.id = d.city_id
        where d.ready_at >= ${from.toISOString()}::timestamptz and d.ready_at < ${to.toISOString()}::timestamptz and d.status <> 'cancelled' ${this.filters(query)}`),
      this.params.getNumber('logistica_alerta_entrega_min'),
    ]);
    const list = (rows.rows as unknown as Row[]).map((r) => ({ ...r, to_assigned_min: r.to_assigned_min === null ? null : Number(r.to_assigned_min), to_collected_min: r.to_collected_min === null ? null : Number(r.to_collected_min), to_delivered_min: r.to_delivered_min === null ? null : Number(r.to_delivered_min) }));
    const finished = list.filter((r) => ['delivered', 'not_delivered', 'returned_to_store'].includes(r.status));
    const delivered = list.filter((r) => r.status === 'delivered');
    const withCost = list.filter((r) => r.cost_cents !== null);
    const feeCents = list.reduce((s, r) => s + r.fee_cents, 0);
    const costCents = withCost.reduce((s, r) => s + (r.cost_cents ?? 0), 0);
    // margem só das corridas com custo registrado (a taxa de corrida sem custo ainda não tem contrapartida)
    const marginCents = withCost.reduce((s, r) => s + r.fee_cents - (r.cost_cents ?? 0), 0);
    const freeShipping = list.filter((r) => r.kind === 'delivery' && r.fee_cents === 0);
    const failures: Record<string, number> = {};
    for (const r of list) if (r.fail_reason) failures[r.fail_reason] = (failures[r.fail_reason] ?? 0) + 1;

    const cityIds = new Set(list.map((r) => r.city_id ?? 'none'));
    const byCity = [...cityIds].map((id) => {
      const rowsOfCity = list.filter((r) => (r.city_id ?? 'none') === id);
      const costed = rowsOfCity.filter((r) => r.cost_cents !== null);
      const margin = costed.reduce((s, r) => s + r.fee_cents - (r.cost_cents ?? 0), 0);
      return {
        cityId: id === 'none' ? null : id,
        cityName: rowsOfCity[0]?.city_name ?? null,
        deliveries: rowsOfCity.length,
        fee: money(rowsOfCity.reduce((s, r) => s + r.fee_cents, 0)),
        cost: money(costed.reduce((s, r) => s + (r.cost_cents ?? 0), 0)),
        margin: money(margin),
        negativeMargin: margin < 0,
      };
    });
    return {
      period: { from: query.from, to: query.to },
      totals: {
        deliveries: list.length,
        finished: finished.length,
        delivered: delivered.length,
        onTime: delivered.filter((r) => r.to_delivered_min !== null && r.to_delivered_min <= limitMin).length,
        onTimeLimitMinutes: limitMin,
        failuresByReason: failures,
        avgMinutes: { readyToAssigned: avg(list.map((r) => r.to_assigned_min)), readyToCollected: avg(list.map((r) => r.to_collected_min)), readyToDelivered: avg(delivered.map((r) => r.to_delivered_min)) },
        feeCollected: money(feeCents),
        cost: money(costCents),
        margin: money(marginCents),
        runsWithoutCost: list.length - withCost.length,
        freeShippingDeliveries: freeShipping.length,
        freeShippingCost: money(freeShipping.reduce((s, r) => s + (r.cost_cents ?? 0), 0)),
      },
      byCity: byCity.sort((a, b) => a.margin.amount - b.margin.amount),
    };
  }

  /** "A pagar por motoboy": custo das corridas JÁ lançadas e ainda não pagas, no período (C2); mostra quem lançou (SEC-145). */
  async payable(query: LogisticsReportQuery) {
    const from = dayStart(query.from);
    const to = dayAfter(query.to);
    const rows = await this.db.execute(sql`
      select d.courier_id, cr.name as courier_name, cr.phone as courier_phone, count(*)::int as runs, sum(d.cost_cents)::int as total,
             min(d.ready_at) as oldest, array_agg(distinct d.cost_registered_by) filter (where d.cost_registered_by is not null) as registered_by
      from deliveries d join couriers cr on cr.id = d.courier_id
      where d.cost_cents is not null and d.cost_paid_at is null and d.status <> 'cancelled' and d.courier_id is not null
        and d.ready_at >= ${from.toISOString()}::timestamptz and d.ready_at < ${to.toISOString()}::timestamptz ${this.filters(query)}
      group by d.courier_id, cr.name, cr.phone order by total desc, cr.name`);
    const data = (rows.rows as unknown as { courier_id: string; courier_name: string; courier_phone: string; runs: number; total: number; oldest: Date | string; registered_by: string[] | null }[]).map((r) => ({
      courierId: r.courier_id,
      courierName: r.courier_name,
      courierPhone: r.courier_phone,
      runs: r.runs,
      total: money(r.total),
      oldestRunAt: new Date(r.oldest).toISOString(),
      registeredBy: r.registered_by ?? [],
    }));
    return { period: { from: query.from, to: query.to }, data, total: money(data.reduce((s, r) => s + r.total.amount, 0)), runs: data.reduce((s, r) => s + r.runs, 0) };
  }

  /** CSV do "a pagar" (valores em centavos; começa com BOM para o Excel). */
  payableCsv(report: Awaited<ReturnType<LogisticsReportService['payable']>>): string {
    const header = ['motoboy_id', 'motoboy', 'telefone', 'corridas', 'total_centavos', 'corrida_mais_antiga', 'lancado_por'];
    const lines = report.data.map((r) => [csvCell(r.courierId), csvCell(r.courierName), csvCell(r.courierPhone), r.runs, r.total.amount, r.oldestRunAt, csvCell(r.registeredBy.join('|'))].join(';'));
    return `${BOM}${[header.join(';'), ...lines].join('\r\n')}\r\n`;
  }
}
