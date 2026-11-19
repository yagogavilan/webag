import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError } from '../../platform/http/app-error.js';
import { users } from '../identity/db/schema.js';
import { AuditService } from './audit.service.js';
import { maintenanceState } from './db/schema.js';

export const DEFAULT_MAINTENANCE_MESSAGE = 'Estamos em manutenção rápida. Voltamos já; seus pedidos em andamento continuam normalmente.';

export interface MaintenanceView {
  active: boolean;
  message: string | null;
  expectedBackAt: string | null;
}

export interface MaintenanceAdminView extends MaintenanceView {
  updatedAt: string | null;
  updatedByName: string | null;
}

/**
 * WB-121 / DEC-073: modo manutenção = parar as vendas com um clique. Bloqueia só o pedido NOVO (e a intenção de cartão, que leva a um pedido novo);
 * leitura, sacola, pedido em andamento (inclusive pagar o que já foi criado), webhooks do provedor e o admin continuam. Desligar não pede nada ao usuário.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async status(): Promise<MaintenanceView> {
    const [row] = await this.db.select().from(maintenanceState).where(eq(maintenanceState.id, 1));
    if (!row?.enabled) return { active: false, message: null, expectedBackAt: null };
    return { active: true, message: row.message ?? DEFAULT_MAINTENANCE_MESSAGE, expectedBackAt: row.expectedBackAt?.toISOString() ?? null };
  }

  /** Chamada na criação de pedido novo: 503 `MAINTENANCE` com mensagem amigável e a previsão (se houver). */
  async assertNewOrdersAllowed(): Promise<void> {
    const status = await this.status();
    if (!status.active) return;
    throw new AppError(503, 'MAINTENANCE', 'Voltamos já', {
      detail: status.message ?? DEFAULT_MAINTENANCE_MESSAGE,
      retryAfterSeconds: 60,
      extensions: { expectedBackAt: status.expectedBackAt },
    });
  }

  async adminView(): Promise<MaintenanceAdminView> {
    const [row] = await this.db
      .select({ state: maintenanceState, updatedByName: users.name })
      .from(maintenanceState)
      .leftJoin(users, eq(users.id, maintenanceState.updatedBy))
      .where(eq(maintenanceState.id, 1));
    const status = await this.status();
    return { ...status, updatedAt: row?.state.updatedAt.toISOString() ?? null, updatedByName: row?.updatedByName ?? null };
  }

  /** Liga ou desliga; mensagem e previsão só valem ao ligar. Auditado com motivo, antes e depois (falha fechada: sem log, não muda). */
  async set(input: { enabled: boolean; message?: string | undefined; expectedBackAt?: Date | null | undefined; reason: string }, ctx: RequestContext): Promise<MaintenanceAdminView> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(maintenanceState).where(eq(maintenanceState.id, 1)).for('update');
      const before = { enabled: current?.enabled ?? false, message: current?.message ?? null, expectedBackAt: current?.expectedBackAt?.toISOString() ?? null };
      const next = input.enabled
        ? { enabled: true, message: input.message ?? null, expectedBackAt: input.expectedBackAt ?? null }
        : { enabled: false, message: null, expectedBackAt: null };
      await tx
        .insert(maintenanceState)
        .values({ id: 1, ...next, updatedBy: ctx.principal?.userId ?? null })
        .onConflictDoUpdate({ target: maintenanceState.id, set: { ...next, updatedAt: new Date(), updatedBy: ctx.principal?.userId ?? null } });
      await this.audit.record(tx, ctx, {
        action: input.enabled ? 'maintenance.enable' : 'maintenance.disable',
        targetType: 'platform',
        targetId: 'maintenance',
        before,
        after: { enabled: next.enabled, message: next.message, expectedBackAt: next.expectedBackAt?.toISOString() ?? null },
        reason: input.reason,
      });
    });
    return this.adminView();
  }
}
