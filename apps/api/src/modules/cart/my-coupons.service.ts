import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { couponRedemptions, coupons } from './db/schema.js';

export const MY_COUPON_STATUSES = ['available', 'used', 'expired', 'all'] as const;
export type MyCouponStatus = (typeof MY_COUPON_STATUSES)[number];

/** Dado mínimo do cupom pessoal: o que o cliente precisa para reconhecer e usar. Sem pedido de origem, sem contagem de usos. */
export interface MyCouponView {
  id: string;
  code: string;
  kind: 'free_shipping' | 'fixed' | 'percent';
  /** Só `fixed`. */
  valueCents: number | null;
  /** Só `percent`. */
  percent: number | null;
  minOrderCents: number;
  startsAt: string;
  expiresAt: string;
  status: 'available' | 'used' | 'expired';
  origin: 'late_delivery' | 'other';
}

/** `GET /v1/me/coupons`: cupons PESSOAIS do cliente (hoje, a compensação por atraso, WB-254). Sempre do `userId` do token. */
@Injectable()
export class MyCouponsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async list(userId: string, query: { status?: MyCouponStatus | undefined; cursor?: string | undefined; limit?: unknown }): Promise<Page<MyCouponView>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const status = query.status ?? 'available';
    const usedNow = sql`exists (select 1 from ${couponRedemptions} r where r.coupon_id = ${coupons.id} and r.user_id = ${userId}::uuid and r.released_at is null)`;
    const stateFilter: Record<MyCouponStatus, SQL | undefined> = {
      all: undefined,
      used: usedNow,
      expired: sql`(not ${usedNow} and ${coupons.endsAt} <= now())`,
      available: sql`(not ${usedNow} and ${coupons.active} and ${coupons.startsAt} <= now() and ${coupons.endsAt} > now())`,
    };
    const rows = await this.db
      .select({ coupon: coupons, used: sql<boolean>`${usedNow}`, expired: sql<boolean>`${coupons.endsAt} <= now()`, notStarted: sql<boolean>`${coupons.startsAt} > now()` })
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
        status: used ? ('used' as const) : expired || !c.active ? ('expired' as const) : ('available' as const),
        origin: c.sourceOrderId ? ('late_delivery' as const) : ('other' as const),
      })),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }
}
