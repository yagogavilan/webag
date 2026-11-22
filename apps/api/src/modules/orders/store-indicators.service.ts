import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { CANCELLATION_STATUSES, NON_GMV_STATUSES } from './domain/metrics.js';
import { orders } from './db/schema.js';

export interface StoreIndicators {
  /** Pedidos que chegaram a RECEBIDO (têm `paid_at`) na janela. */
  orders: number;
  /** GMV em centavos: soma dos pedidos acima, exceto `NON_GMV_STATUSES` (RN-15). */
  gmvCents: number;
  /** Cancelamentos = `cancelled` + `refused` sobre os mesmos pedidos (RN-15). */
  cancelled: number;
}

export interface RecentPaidOrder {
  id: string;
  status: string;
  totalCents: number;
  createdAt: Date;
}

/**
 * DT-088 (ADR-018 D15): API pública do módulo `orders` para quem precisa de INDICADORES de uma loja (a ficha 360 do `backoffice`). A definição de GMV e de
 * cancelamento mora aqui, num lugar só (`domain/metrics.ts`, RN-15); quem consome nunca lê a tabela de pedidos nem repete a lista de estados. Só leitura.
 */
@Injectable()
export class StoreIndicatorsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /** Janela pela data do PAGAMENTO (`paid_at >= since`), não pela criação do pedido. */
  async indicators(storeId: string, since: Date): Promise<StoreIndicators> {
    const [row] = await this.db
      .select({
        orders: sql<number>`count(*)::int`,
        gmv: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${notInArray(orders.status, [...NON_GMV_STATUSES])}), 0)::bigint`,
        cancelled: sql<number>`count(*) filter (where ${inArray(orders.status, [...CANCELLATION_STATUSES])})::int`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), gte(orders.paidAt, since)));
    return { orders: Number(row?.orders ?? 0), gmvCents: Number(row?.gmv ?? 0), cancelled: Number(row?.cancelled ?? 0) };
  }

  /** Últimos pedidos PAGOS da loja (sem dado de cliente), mais novos primeiro. */
  async recentPaid(storeId: string, limit: number): Promise<RecentPaidOrder[]> {
    const rows = await this.db
      .select({ id: orders.id, status: orders.status, totalCents: orders.totalCents, createdAt: orders.createdAt })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), isNotNull(orders.paidAt)))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit);
    return rows;
  }
}
