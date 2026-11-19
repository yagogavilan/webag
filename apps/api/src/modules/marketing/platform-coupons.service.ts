import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql, type SQL } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { AuditService } from '../admin/index.js';
import { isUniqueViolation } from '../admin/util.js';

type CouponRow = typeof t.coupons.$inferSelect;
type CouponStatus = 'scheduled' | 'live' | 'paused' | 'ended' | 'exhausted';

export interface CouponInput {
  code: string;
  kind: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  percentCapCents?: number | null | undefined;
  minOrderCents: number;
  startsAt: Date;
  endsAt: Date;
  maxUses?: number | null | undefined;
  perCustomerLimit: number;
  firstPurchaseOnly: boolean;
}

/** DEC-016/SEC-060: o desconto da plataforma é cortado na taxa Webag do pedido; o painel mostra este aviso ao salvar. */
export const PLATFORM_COUPON_NOTICE = 'Em pedidos com comissão menor, o desconto da plataforma é limitado à taxa Webag do pedido (comissão, entrega e serviço).';

/**
 * WB-116: cupons da PLATAFORMA (custo da Webag, RN-09/10). Escopo fixo `platform`; o cupom de loja é do lojista. Depois do 1º uso,
 * código, tipo e valor não mudam (o histórico dos pedidos continua batendo); pausar vale na hora. Alvo por cidade, categoria ou loja
 * ainda não existe no modelo (`coupons` não guarda alvo): todo cupom da plataforma vale em todas as lojas [pendência com o PO].
 */
@Injectable()
export class PlatformCouponsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  private status(row: CouponRow, uses: number, now = new Date()): CouponStatus {
    if (!row.active) return 'paused';
    if (row.endsAt <= now) return 'ended';
    if (row.maxUses !== null && uses >= row.maxUses) return 'exhausted';
    if (row.startsAt > now) return 'scheduled';
    return 'live';
  }

  private present(row: CouponRow, stats: { uses: number; discountCents: number; orders: number }) {
    return {
      id: row.id,
      code: row.code,
      kind: row.kind,
      value: row.value,
      percentCapCents: row.percentCapCents,
      minOrderCents: row.minOrderCents,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      maxUses: row.maxUses,
      perCustomerLimit: row.perCustomerLimit,
      firstPurchaseOnly: row.firstPurchaseOnly,
      active: row.active,
      status: this.status(row, stats.uses),
      uses: stats.uses,
      discountTotal: { amount: stats.discountCents, currency: 'BRL' as const },
      orders: stats.orders,
      notice: PLATFORM_COUPON_NOTICE,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Usos (não devolvidos), desconto total e pedidos por cupom (WB-116 C5). */
  private async stats(ids: string[]): Promise<Map<string, { uses: number; discountCents: number; orders: number }>> {
    const map = new Map<string, { uses: number; discountCents: number; orders: number }>();
    if (ids.length === 0) return map;
    const res = await this.db.execute<{ coupon_id: string; uses: number; total: number; orders: number }>(sql`
      select coupon_id, count(*)::int as uses, coalesce(sum(discount_cents), 0)::int as total, count(distinct order_id)::int as orders
      from coupon_redemptions where released_at is null and coupon_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}) group by coupon_id`);
    for (const row of res.rows) map.set(row.coupon_id, { uses: row.uses, discountCents: row.total, orders: row.orders });
    return map;
  }

  private validate(input: CouponInput): void {
    const problems: { field: string; message: string }[] = [];
    if (!/^[A-Z0-9]{4,20}$/.test(input.code)) problems.push({ field: 'code', message: 'Use de 4 a 20 letras e números, sem espaços.' });
    if (input.kind === 'percent' && (input.value < 1 || input.value > 100)) problems.push({ field: 'value', message: 'O percentual vai de 1 a 100.' });
    if (input.kind === 'fixed' && input.value < 1) problems.push({ field: 'value', message: 'Informe o valor do desconto em centavos.' });
    if (input.kind === 'free_shipping' && input.value !== 0) problems.push({ field: 'value', message: 'Frete grátis não leva valor.' });
    if (input.kind !== 'percent' && input.percentCapCents != null) problems.push({ field: 'percentCapCents', message: 'O teto só vale para cupom percentual.' });
    if (input.endsAt <= input.startsAt) problems.push({ field: 'endsAt', message: 'O fim precisa ser depois do início.' });
    if (problems.length > 0) throw errors.validation(problems);
  }

  async create(ctx: RequestContext, input: CouponInput) {
    this.validate(input);
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.coupons)
          .values({ code: input.code, kind: input.kind, scope: 'platform', value: input.value, percentCapCents: input.percentCapCents ?? null, minOrderCents: input.minOrderCents, startsAt: input.startsAt, endsAt: input.endsAt, maxUses: input.maxUses ?? null, perCustomerLimit: input.perCustomerLimit, firstPurchaseOnly: input.firstPurchaseOnly })
          .returning();
        if (!row) throw new Error('Falha ao criar o cupom');
        await this.audit.record(tx, ctx, { action: 'coupon.created', targetType: 'coupon', targetId: row.id, after: { code: row.code, kind: row.kind, value: row.value, endsAt: row.endsAt.toISOString(), maxUses: row.maxUses } });
        return this.present(row, { uses: 0, discountCents: 0, orders: 0 });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('COUPON_CODE_TAKEN', 'Esse código já existe', 'Escolha outro código.');
      throw error;
    }
  }

  private async load(id: string): Promise<CouponRow> {
    const [row] = await this.db.select().from(t.coupons).where(and(eq(t.coupons.id, id), eq(t.coupons.scope, 'platform'), isNull(t.coupons.ownerUserId)));
    if (!row) throw errors.notFound('Cupom não encontrado.');
    return row;
  }

  async get(id: string) {
    const row = await this.load(id);
    return this.present(row, (await this.stats([id])).get(id) ?? { uses: 0, discountCents: 0, orders: 0 });
  }

  async list(query: { status?: CouponStatus | undefined; q?: string | undefined; cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const conditions: (SQL | undefined)[] = [eq(t.coupons.scope, 'platform'), isNull(t.coupons.ownerUserId)]; // cupom pessoal de compensação não entra na lista da campanha
    if (query.q) conditions.push(ilike(t.coupons.code, `%${query.q.replace(/[%_\\]/g, '')}%`));
    if (cursor) conditions.push(sql`(${t.coupons.createdAt}, ${t.coupons.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`);
    const rows = await this.db.select().from(t.coupons).where(and(...conditions)).orderBy(desc(t.coupons.createdAt), desc(t.coupons.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const stats = await this.stats(page.map((r) => r.id));
    let data = page.map((r) => this.present(r, stats.get(r.id) ?? { uses: 0, discountCents: 0, orders: 0 }));
    if (query.status) data = data.filter((c) => c.status === query.status);
    const last = page.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  /** Pausar, reativar, prorrogar, mudar limites e mínimo. Depois do 1º uso o tipo e o valor ficam travados. */
  async update(ctx: RequestContext, id: string, patch: Partial<Pick<CouponInput, 'value' | 'percentCapCents' | 'minOrderCents' | 'endsAt' | 'maxUses' | 'perCustomerLimit' | 'firstPurchaseOnly'>> & { active?: boolean | undefined }) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(t.coupons).where(and(eq(t.coupons.id, id), eq(t.coupons.scope, 'platform'), isNull(t.coupons.ownerUserId))).for('update');
      if (!before) throw errors.notFound('Cupom não encontrado.');
      const stats = (await this.stats([id])).get(id) ?? { uses: 0, discountCents: 0, orders: 0 };
      const changesMoney = patch.value !== undefined || patch.percentCapCents !== undefined;
      if (changesMoney && stats.uses > 0) throw errors.conflict('COUPON_IN_USE', 'O cupom já foi usado', 'Depois do primeiro uso o valor não muda. Pause e crie outro.');
      const next: CouponInput = { code: before.code, kind: before.kind, value: patch.value ?? before.value, percentCapCents: patch.percentCapCents === undefined ? before.percentCapCents : patch.percentCapCents, minOrderCents: patch.minOrderCents ?? before.minOrderCents, startsAt: before.startsAt, endsAt: patch.endsAt ?? before.endsAt, maxUses: patch.maxUses === undefined ? before.maxUses : patch.maxUses, perCustomerLimit: patch.perCustomerLimit ?? before.perCustomerLimit, firstPurchaseOnly: patch.firstPurchaseOnly ?? before.firstPurchaseOnly };
      this.validate(next);
      if (next.maxUses !== null && next.maxUses !== undefined && next.maxUses < stats.uses) throw errors.validation([{ field: 'maxUses', message: `O cupom já teve ${stats.uses} usos.` }]);
      const [row] = await tx
        .update(t.coupons)
        .set({ value: next.value, percentCapCents: next.percentCapCents ?? null, minOrderCents: next.minOrderCents, endsAt: next.endsAt, maxUses: next.maxUses ?? null, perCustomerLimit: next.perCustomerLimit, firstPurchaseOnly: next.firstPurchaseOnly, ...(patch.active === undefined ? {} : { active: patch.active }) })
        .where(eq(t.coupons.id, id))
        .returning();
      if (!row) throw new Error('Falha ao atualizar o cupom');
      await this.audit.record(tx, ctx, { action: patch.active === false && before.active ? 'coupon.paused' : 'coupon.updated', targetType: 'coupon', targetId: id, before: { active: before.active, value: before.value, endsAt: before.endsAt.toISOString(), maxUses: before.maxUses }, after: { active: row.active, value: row.value, endsAt: row.endsAt.toISOString(), maxUses: row.maxUses } });
      return this.present(row, stats);
    });
  }
}
