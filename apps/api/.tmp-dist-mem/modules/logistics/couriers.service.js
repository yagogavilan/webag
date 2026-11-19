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
import { and, asc, eq, gt, ilike, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { AuditService } from '../admin/index.js';
import { isUniqueViolation } from '../admin/util.js';
import { couriers, deliveries } from './db/schema.js';
import { ACTIVE_STATUSES, WITH_COURIER } from './domain/state.js';
import { normalizePhone } from './domain/whatsapp.js';
/** Motoboys (WB-231): cadastro mínimo, sem exclusão (só inativar), tudo auditado com antes e depois. */
let CouriersService = class CouriersService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    phoneOrFail(raw) {
        const phone = normalizePhone(raw);
        if (!phone)
            throw errors.unprocessable('COURIER_PHONE_INVALID', 'Telefone inválido', { detail: 'Informe o WhatsApp com DDD.', errors: [{ field: 'phone', message: 'Informe o WhatsApp com DDD.' }] });
        return phone;
    }
    async create(input, ctx) {
        if (!input.documentsChecked)
            throw errors.unprocessable('COURIER_DOCUMENTS_NOT_CHECKED', 'Confirme os documentos', { detail: 'Confirme que os documentos foram conferidos fora do app.', errors: [{ field: 'documentsChecked', message: 'Confirme a conferência dos documentos.' }] });
        const phone = this.phoneOrFail(input.phone);
        try {
            return await this.db.transaction(async (tx) => {
                const [row] = await tx.insert(couriers).values({ name: input.name.trim(), phone, note: input.note?.trim() || null, documentsCheckedAt: new Date(), createdBy: ctx.principal?.userId ?? null }).returning();
                await this.audit.record(tx, ctx, { action: 'courier.create', targetType: 'courier', targetId: row.id, after: { name: row.name, active: true } });
                return row;
            });
        }
        catch (error) {
            if (isUniqueViolation(error))
                throw errors.conflict('COURIER_PHONE_IN_USE', 'Esse telefone já está cadastrado', 'Esse telefone já está cadastrado.');
            throw error;
        }
    }
    async update(id, patch, ctx) {
        try {
            return await this.db.transaction(async (tx) => {
                const [before] = await tx.select().from(couriers).where(eq(couriers.id, id)).for('update');
                if (!before)
                    throw errors.notFound('Motoboy não encontrado.');
                if (patch.active === false && before.active) {
                    const [busy] = await tx.select({ n: sql `count(*)::int` }).from(deliveries).where(and(eq(deliveries.courierId, id), inArray(deliveries.status, [...WITH_COURIER].filter((s) => ACTIVE_STATUSES.includes(s)))));
                    if ((busy?.n ?? 0) > 0)
                        throw errors.conflict('COURIER_HAS_ACTIVE_DELIVERIES', 'Reatribua a corrida primeiro', 'Este motoboy tem corrida em andamento. Reatribua a corrida primeiro.');
                }
                const set = { ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.phone !== undefined ? { phone: this.phoneOrFail(patch.phone) } : {}), ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}), updatedAt: new Date() };
                const [after] = await tx.update(couriers).set(set).where(eq(couriers.id, id)).returning();
                await this.audit.record(tx, ctx, { action: 'courier.update', targetType: 'courier', targetId: id, before: { name: before.name, phone: before.phone, active: before.active, note: before.note }, after: { name: after.name, phone: after.phone, active: after.active, note: after.note } });
                return after;
            });
        }
        catch (error) {
            if (isUniqueViolation(error))
                throw errors.conflict('COURIER_PHONE_IN_USE', 'Esse telefone já está cadastrado', 'Esse telefone já está cadastrado.');
            throw error;
        }
    }
    async get(id) {
        const [row] = await this.db.select().from(couriers).where(eq(couriers.id, id));
        if (!row)
            throw errors.notFound('Motoboy não encontrado.');
        return row;
    }
    /** Lista paginada por nome; traz as corridas dos últimos 7 dias e se está em corrida agora (WB-231 C2). */
    async list(query) {
        const limit = parseLimit(query.limit);
        const cursor = decodeCursor(query.cursor);
        const rows = await this.db
            .select()
            .from(couriers)
            .where(and(query.active === undefined ? undefined : eq(couriers.active, query.active), query.q ? ilike(couriers.name, `%${query.q.replace(/[%_]/g, '')}%`) : undefined, cursor ? sql `(${couriers.name}, ${couriers.id}) > (${cursor.name}, ${cursor.id}::uuid)` : undefined))
            .orderBy(asc(couriers.name), asc(couriers.id))
            .limit(limit + 1);
        const page = rows.slice(0, limit);
        const ids = page.map((c) => c.id);
        const stats = ids.length
            ? await this.db
                .select({
                courierId: deliveries.courierId,
                week: sql `count(*) filter (where ${deliveries.status} = 'delivered' and ${deliveries.updatedAt} > now() - interval '7 days')::int`,
                busy: sql `count(*) filter (where ${deliveries.status} in ('awaiting_courier','courier_en_route','out_for_delivery','not_delivered'))::int`,
            })
                .from(deliveries)
                .where(and(inArray(deliveries.courierId, ids), gt(deliveries.updatedAt, new Date(Date.now() - 7 * 86_400_000))))
                .groupBy(deliveries.courierId)
            : [];
        const byCourier = new Map(stats.map((s) => [s.courierId, s]));
        const last = page.at(-1);
        return {
            data: page.map((c) => ({ ...c, deliveriesLast7Days: byCourier.get(c.id)?.week ?? 0, busyNow: (byCourier.get(c.id)?.busy ?? 0) > 0 })),
            nextCursor: rows.length > limit && last ? encodeCursor({ name: last.name, id: last.id }) : null,
        };
    }
};
CouriersService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, AuditService])
], CouriersService);
export { CouriersService };
//# sourceMappingURL=couriers.service.js.map