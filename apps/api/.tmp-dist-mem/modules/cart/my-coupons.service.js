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
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc } from '../../platform/http/pagination.js';
import { couponRedemptions, coupons } from './db/schema.js';
export const MY_COUPON_STATUSES = ['available', 'used', 'expired', 'all'];
/** `GET /v1/me/coupons`: cupons PESSOAIS do cliente (hoje, a compensação por atraso, WB-254). Sempre do `userId` do token. */
let MyCouponsService = class MyCouponsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(userId, query) {
        const limit = parseLimit(query.limit);
        const cursor = decodeCursor(query.cursor);
        const status = query.status ?? 'available';
        const usedNow = sql `exists (select 1 from ${couponRedemptions} r where r.coupon_id = ${coupons.id} and r.user_id = ${userId}::uuid and r.released_at is null)`;
        const stateFilter = {
            all: undefined,
            used: usedNow,
            expired: sql `(not ${usedNow} and ${coupons.endsAt} <= now())`,
            available: sql `(not ${usedNow} and ${coupons.active} and ${coupons.startsAt} <= now() and ${coupons.endsAt} > now())`,
        };
        const rows = await this.db
            .select({ coupon: coupons, used: sql `${usedNow}`, expired: sql `${coupons.endsAt} <= now()`, notStarted: sql `${coupons.startsAt} > now()` })
            .from(coupons)
            .where(and(eq(coupons.ownerUserId, userId), stateFilter[status], timestampCursorBefore(coupons.createdAt, coupons.id, cursor)))
            .orderBy(...timestampOrderDesc(coupons.createdAt, coupons.id))
            .limit(limit + 1);
        const page = rows.slice(0, limit);
        const last = page.at(-1)?.coupon;
        return {
            data: page.map(({ coupon: c, used, expired }) => ({
                id: c.id,
                code: c.code,
                kind: c.kind,
                valueCents: c.kind === 'fixed' ? c.value : null,
                percent: c.kind === 'percent' ? c.value : null,
                minOrderCents: c.minOrderCents,
                startsAt: c.startsAt.toISOString(),
                expiresAt: c.endsAt.toISOString(),
                status: used ? 'used' : expired || !c.active ? 'expired' : 'available',
                origin: c.sourceOrderId ? 'late_delivery' : 'other',
            })),
            nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null,
        };
    }
};
MyCouponsService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], MyCouponsService);
export { MyCouponsService };
//# sourceMappingURL=my-coupons.service.js.map