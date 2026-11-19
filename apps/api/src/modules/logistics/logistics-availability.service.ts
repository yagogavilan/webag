import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { logisticsPauses } from './db/schema.js';
import { endsBeforeClosing, isLogisticsOpen, nextLogisticsOpening, type LogisticsDays } from './domain/hours.js';

export interface LogisticsStatus {
  open: boolean;
  /** `HOURS` = fora do horário; `PAUSED` = pausada pelo admin (geral ou da cidade). */
  closedBy: 'HOURS' | 'PAUSED' | null;
  /** Próxima abertura (só quando fechada por horário; pausa não tem previsão). */
  opensAt: Date | null;
  pauseReason: string | null;
}

/**
 * Horário e pausa da logística (BUG-016, WB-230 C6, RN-18, DEC-039c). Uma só conta para o checkout, a descoberta e o pedido: fora do
 * horário (`logistica_horario` + `logistica_dias`) ou pausada (geral ou da cidade de destino), a entrega não é oferecida.
 */
@Injectable()
export class LogisticsAvailabilityService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `cityId` = cidade de DESTINO; pausa geral (sem cidade) vale para todas. `arriveByMin` = fim da faixa de chegada em minutos a partir de
   * agora (RN-19 item 2, BUG-021): se o fim da faixa passa do fechamento, a entrega não é oferecida ("volta às HH:MM" = próxima abertura).
   */
  async status(cityId: string | null, now = new Date(), arriveByMin?: number): Promise<LogisticsStatus> {
    const [pause] = await this.activePause(cityId);
    if (pause) return { open: false, closedBy: 'PAUSED', opensAt: null, pauseReason: pause.reason };
    const hours = { window: String(await this.params.get('logistica_horario')), days: String(await this.params.get('logistica_dias')) as LogisticsDays };
    if (isLogisticsOpen(hours, now) && (arriveByMin === undefined || endsBeforeClosing(hours, now, new Date(now.getTime() + arriveByMin * 60_000)))) return { open: true, closedBy: null, opensAt: null, pauseReason: null };
    return { open: false, closedBy: 'HOURS', opensAt: nextLogisticsOpening(hours, now), pauseReason: null };
  }

  private activePause(cityId: string | null) {
    const rows = this.db.select().from(logisticsPauses).where(isNull(logisticsPauses.resumedAt)).orderBy(desc(logisticsPauses.pausedAt));
    return rows.then((all) => all.filter((p) => p.cityId === null || p.cityId === cityId).slice(0, 1));
  }

  async listPauses() {
    return this.db.select().from(logisticsPauses).where(isNull(logisticsPauses.resumedAt)).orderBy(desc(logisticsPauses.pausedAt));
  }

  /** Pausa geral ou de uma cidade, com motivo (auditado). Repetir a mesma pausa é idempotente. */
  async pause(input: { cityId?: string | null | undefined; reason: string }, ctx: RequestContext) {
    const cityId = input.cityId ?? null;
    return this.db.transaction(async (tx) => {
      const [open] = await tx.select().from(logisticsPauses).where(and(isNull(logisticsPauses.resumedAt), cityId === null ? isNull(logisticsPauses.cityId) : eq(logisticsPauses.cityId, cityId)));
      if (open) return open;
      const [row] = await tx.insert(logisticsPauses).values({ cityId, reason: input.reason, pausedBy: ctx.principal?.userId ?? null }).returning();
      await this.audit.record(tx, ctx, { action: 'logistics.pause', targetType: 'logistics', targetId: cityId ?? undefined, after: { cityId }, reason: input.reason });
      return row!;
    });
  }

  async resume(input: { cityId?: string | null | undefined }, ctx: RequestContext): Promise<void> {
    const cityId = input.cityId ?? null;
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(logisticsPauses)
        .set({ resumedAt: new Date(), resumedBy: ctx.principal?.userId ?? null })
        .where(and(isNull(logisticsPauses.resumedAt), cityId === null ? isNull(logisticsPauses.cityId) : eq(logisticsPauses.cityId, cityId)))
        .returning({ id: logisticsPauses.id });
      if (rows.length === 0) throw errors.conflict('NOT_PAUSED', 'Não há pausa ativa', 'A entrega já está liberada.');
      await this.audit.record(tx, ctx, { action: 'logistics.resume', targetType: 'logistics', targetId: cityId ?? undefined, after: { cityId } });
    });
  }
}
