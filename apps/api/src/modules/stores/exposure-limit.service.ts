import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ParametersService } from '../admin/index.js';
import { orders } from '../orders/db/schema.js';
import { stores } from './db/schema.js';
import { evaluateExposureLimit, type ExposureLimit, type ExposureMode } from './exposure-limit.js';

/**
 * Limite de exposição da loja nova (WB-225, SEC-062). Lê os pedidos entregues direto da tabela `orders` (só contagem); o
 * módulo de pedidos depende deste, então não há como chamá-lo sem criar ciclo.
 */
@Injectable()
export class ExposureLimitService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
  ) {}

  async forStore(storeId: string, now = new Date()): Promise<ExposureLimit> {
    const [store] = await this.db
      .select({ mode: stores.exposureLimitMode, max: stores.exposureLimitMaxCents, approvedAt: stores.approvedAt, createdAt: stores.createdAt })
      .from(stores)
      .where(eq(stores.id, storeId));
    if (!store) throw errors.notFound('Loja não encontrada.');
    const [delivered] = await this.db.select({ n: count() }).from(orders).where(and(eq(orders.storeId, storeId), eq(orders.status, 'delivered')));
    return evaluateExposureLimit({
      mode: store.mode,
      customMaxCents: store.max,
      since: store.approvedAt ?? store.createdAt,
      deliveredOrders: delivered?.n ?? 0,
      now,
      params: {
        days: await this.params.getNumber('loja_nova_dias'),
        orders: await this.params.getNumber('loja_nova_pedidos'),
        maxOrderCents: await this.params.getNumber('loja_nova_pedido_max_cents'),
      },
    });
  }

  async configure(tx: Tx, storeId: string, input: { mode: ExposureMode; maxOrderCents: number | null; reason: string; actorId: string }): Promise<{ before: { mode: ExposureMode; maxOrderCents: number | null } }> {
    const [before] = await tx.select({ mode: stores.exposureLimitMode, max: stores.exposureLimitMaxCents }).from(stores).where(eq(stores.id, storeId)).for('update');
    if (!before) throw errors.notFound('Loja não encontrada.');
    await tx
      .update(stores)
      .set({ exposureLimitMode: input.mode, exposureLimitMaxCents: input.mode === 'custom' ? input.maxOrderCents : null, exposureLimitReason: input.reason, exposureLimitSetBy: input.actorId, exposureLimitSetAt: new Date() })
      .where(eq(stores.id, storeId));
    return { before: { mode: before.mode, maxOrderCents: before.max } };
  }
}
