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
import { asc, eq } from 'drizzle-orm';
import { CacheService } from '../../platform/cache/cache.service.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from '../admin/index.js';
import { homeHighlights } from './db/schema.js';
const MAX_LIVE = 12;
/** WB-115 C4: destaques fixados na Início, por cidade e período; entram antes dos critérios automáticos e só se o item estiver visível. */
let HighlightsService = class HighlightsService {
    db;
    audit;
    cache;
    constructor(db, audit, cache) {
        this.db = db;
        this.audit = audit;
        this.cache = cache;
    }
    async present(row) {
        let name = null;
        let available = false;
        if (row.kind === 'store') {
            const [store] = await this.db.select({ name: t.stores.name, status: t.stores.status }).from(t.stores).where(eq(t.stores.id, row.targetId));
            name = store?.name ?? null;
            available = store?.status === 'approved';
        }
        else {
            const [product] = await this.db.select({ name: t.products.name, status: t.products.status, mod: t.products.moderationStatus, storeStatus: t.stores.status }).from(t.products).innerJoin(t.stores, eq(t.stores.id, t.products.storeId)).where(eq(t.products.id, row.targetId));
            name = product?.name ?? null;
            available = product?.status === 'active' && product.mod !== 'removed' && product.storeStatus === 'approved';
        }
        const now = Date.now();
        return {
            id: row.id,
            kind: row.kind,
            targetId: row.targetId,
            targetName: name,
            cityId: row.cityId,
            startsAt: row.startsAt.toISOString(),
            endsAt: row.endsAt.toISOString(),
            position: row.position,
            active: row.active,
            /** O item foi inativado depois: o destaque some do app sozinho (WB-115 C2). */
            targetUnavailable: !available,
            live: row.active && available && row.startsAt.getTime() <= now && row.endsAt.getTime() > now,
        };
    }
    async validate(input) {
        if (input.endsAt <= input.startsAt)
            throw errors.validation([{ field: 'endsAt', message: 'O fim precisa ser depois do início.' }]);
        if (input.cityId) {
            const [city] = await this.db.select({ id: t.cities.id }).from(t.cities).where(eq(t.cities.id, input.cityId));
            if (!city)
                throw errors.validation([{ field: 'cityId', message: 'Cidade não encontrada.' }]);
        }
        const available = input.kind === 'store'
            ? (await this.db.select({ s: t.stores.status }).from(t.stores).where(eq(t.stores.id, input.targetId)))[0]?.s === 'approved'
            : (await this.db.select({ s: t.products.status, st: t.stores.status, m: t.products.moderationStatus }).from(t.products).innerJoin(t.stores, eq(t.stores.id, t.products.storeId)).where(eq(t.products.id, input.targetId))).some((r) => r.s === 'active' && r.st === 'approved' && r.m !== 'removed');
        if (!available)
            throw errors.validation([{ field: 'targetId', message: 'Esse item está inativo. Escolha outro.' }]);
    }
    async list() {
        const rows = await this.db.select().from(homeHighlights).orderBy(asc(homeHighlights.position), asc(homeHighlights.createdAt));
        return { data: await Promise.all(rows.map((r) => this.present(r))), nextCursor: null };
    }
    async create(ctx, input) {
        await this.validate(input);
        const live = (await this.db.select().from(homeHighlights).where(eq(homeHighlights.active, true))).filter((r) => r.endsAt > new Date()).length;
        if (live >= MAX_LIVE)
            throw errors.unprocessable('HIGHLIGHT_LIMIT', 'Muitos destaques ativos', { detail: `No máximo ${MAX_LIVE} destaques ativos ao mesmo tempo.` });
        const row = await this.db.transaction(async (tx) => {
            const [created] = await tx.insert(homeHighlights).values({ kind: input.kind, targetId: input.targetId, cityId: input.cityId ?? null, startsAt: input.startsAt, endsAt: input.endsAt, position: input.position ?? 0, active: input.active ?? true, createdBy: ctx.principal?.userId ?? null }).returning();
            if (!created)
                throw new Error('Falha ao criar o destaque');
            await this.audit.record(tx, ctx, { action: 'highlight.created', targetType: 'highlight', targetId: created.id, after: { kind: created.kind, targetId: created.targetId, cityId: created.cityId, startsAt: created.startsAt.toISOString(), endsAt: created.endsAt.toISOString() } });
            return created;
        });
        await this.cache.bump('home');
        return this.present(row);
    }
    async update(ctx, id, patch) {
        const [before] = await this.db.select().from(homeHighlights).where(eq(homeHighlights.id, id));
        if (!before)
            throw errors.notFound('Destaque não encontrado.');
        const next = { kind: before.kind, targetId: before.targetId, cityId: patch.cityId === undefined ? before.cityId : patch.cityId, startsAt: patch.startsAt ?? before.startsAt, endsAt: patch.endsAt ?? before.endsAt };
        if (patch.active !== false)
            await this.validate(next);
        const row = await this.db.transaction(async (tx) => {
            const [updated] = await tx.update(homeHighlights).set({ cityId: next.cityId, startsAt: next.startsAt, endsAt: next.endsAt, ...(patch.position === undefined ? {} : { position: patch.position }), ...(patch.active === undefined ? {} : { active: patch.active }) }).where(eq(homeHighlights.id, id)).returning();
            if (!updated)
                throw errors.notFound('Destaque não encontrado.');
            await this.audit.record(tx, ctx, { action: 'highlight.updated', targetType: 'highlight', targetId: id, before: { active: before.active, position: before.position }, after: { active: updated.active, position: updated.position } });
            return updated;
        });
        await this.cache.bump('home');
        return this.present(row);
    }
    async remove(ctx, id) {
        const deleted = await this.db.transaction(async (tx) => {
            const [row] = await tx.delete(homeHighlights).where(eq(homeHighlights.id, id)).returning();
            if (row)
                await this.audit.record(tx, ctx, { action: 'highlight.deleted', targetType: 'highlight', targetId: id, before: { kind: row.kind, targetId: row.targetId } });
            return row;
        });
        if (!deleted)
            throw errors.notFound('Destaque não encontrado.');
        await this.cache.bump('home');
    }
};
HighlightsService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, AuditService,
        CacheService])
], HighlightsService);
export { HighlightsService };
//# sourceMappingURL=highlights.service.js.map