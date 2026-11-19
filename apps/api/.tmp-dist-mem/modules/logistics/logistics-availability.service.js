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
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { logisticsPauses } from './db/schema.js';
import { endsBeforeClosing, isLogisticsOpen, nextLogisticsOpening } from './domain/hours.js';
/**
 * Horário e pausa da logística (BUG-016, WB-230 C6, RN-18, DEC-039c). Uma só conta para o checkout, a descoberta e o pedido: fora do
 * horário (`logistica_horario` + `logistica_dias`) ou pausada (geral ou da cidade de destino), a entrega não é oferecida.
 */
let LogisticsAvailabilityService = class LogisticsAvailabilityService {
    db;
    params;
    audit;
    constructor(db, params, audit) {
        this.db = db;
        this.params = params;
        this.audit = audit;
    }
    /**
     * `cityId` = cidade de DESTINO; pausa geral (sem cidade) vale para todas. `arriveByMin` = fim da faixa de chegada em minutos a partir de
     * agora (RN-19 item 2, BUG-021): se o fim da faixa passa do fechamento, a entrega não é oferecida ("volta às HH:MM" = próxima abertura).
     */
    async status(cityId, now = new Date(), arriveByMin) {
        const [pause] = await this.activePause(cityId);
        if (pause)
            return { open: false, closedBy: 'PAUSED', opensAt: null, pauseReason: pause.reason };
        const hours = { window: String(await this.params.get('logistica_horario')), days: String(await this.params.get('logistica_dias')) };
        if (isLogisticsOpen(hours, now) && (arriveByMin === undefined || endsBeforeClosing(hours, now, new Date(now.getTime() + arriveByMin * 60_000))))
            return { open: true, closedBy: null, opensAt: null, pauseReason: null };
        return { open: false, closedBy: 'HOURS', opensAt: nextLogisticsOpening(hours, now), pauseReason: null };
    }
    activePause(cityId) {
        const rows = this.db.select().from(logisticsPauses).where(isNull(logisticsPauses.resumedAt)).orderBy(desc(logisticsPauses.pausedAt));
        return rows.then((all) => all.filter((p) => p.cityId === null || p.cityId === cityId).slice(0, 1));
    }
    async listPauses() {
        return this.db.select().from(logisticsPauses).where(isNull(logisticsPauses.resumedAt)).orderBy(desc(logisticsPauses.pausedAt));
    }
    /** Pausa geral ou de uma cidade, com motivo (auditado). Repetir a mesma pausa é idempotente. */
    async pause(input, ctx) {
        const cityId = input.cityId ?? null;
        return this.db.transaction(async (tx) => {
            const [open] = await tx.select().from(logisticsPauses).where(and(isNull(logisticsPauses.resumedAt), cityId === null ? isNull(logisticsPauses.cityId) : eq(logisticsPauses.cityId, cityId)));
            if (open)
                return open;
            const [row] = await tx.insert(logisticsPauses).values({ cityId, reason: input.reason, pausedBy: ctx.principal?.userId ?? null }).returning();
            await this.audit.record(tx, ctx, { action: 'logistics.pause', targetType: 'logistics', targetId: cityId ?? undefined, after: { cityId }, reason: input.reason });
            return row;
        });
    }
    async resume(input, ctx) {
        const cityId = input.cityId ?? null;
        await this.db.transaction(async (tx) => {
            const rows = await tx
                .update(logisticsPauses)
                .set({ resumedAt: new Date(), resumedBy: ctx.principal?.userId ?? null })
                .where(and(isNull(logisticsPauses.resumedAt), cityId === null ? isNull(logisticsPauses.cityId) : eq(logisticsPauses.cityId, cityId)))
                .returning({ id: logisticsPauses.id });
            if (rows.length === 0)
                throw errors.conflict('NOT_PAUSED', 'Não há pausa ativa', 'A entrega já está liberada.');
            await this.audit.record(tx, ctx, { action: 'logistics.resume', targetType: 'logistics', targetId: cityId ?? undefined, after: { cityId } });
        });
    }
};
LogisticsAvailabilityService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, ParametersService,
        AuditService])
], LogisticsAvailabilityService);
export { LogisticsAvailabilityService };
//# sourceMappingURL=logistics-availability.service.js.map