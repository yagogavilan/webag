import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { hmacHex } from '../../platform/crypto/crypto.js';
import { adminHasPermission } from '../../platform/auth/permissions.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { escapeLike, maskEmail, maskName, maskPhone } from '../../platform/http/pii-mask.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { reviews } from '../discovery/db/schema.js';
import { exchangeRequests } from '../exchanges/db/schema.js';
import { users, type AdminProfile } from '../identity/db/schema.js';
import { deliveries } from '../logistics/db/schema.js';
import { paymentAttempts, paymentRefundIntents } from '../payments/db/schema.js';
import { stores } from '../stores/db/schema.js';
import { canTransition, type OrderStatus } from './domain/state.js';
import { orderEvents, orderItems, orders } from './db/schema.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** A-07 / SEC-181: buscas por minuto de cada admin na lista de pedidos (além do limite por IP do controller). */
export const ORDER_SEARCH_PER_ADMIN_PER_MIN = 60;
const money = (amount: number) => ({ amount, currency: 'BRL' as const });

export interface AdminOrderQuery {
  q?: string | undefined;
  status?: OrderStatus[] | undefined;
  mode?: 'delivery' | 'pickup' | undefined;
  paymentMethod?: 'pix' | 'card' | undefined;
  storeId?: string | undefined;
  userId?: string | undefined;
  city?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit?: unknown;
}

/**
 * B5 / WB-108 e WB-109 (DEC-073): pedidos no admin. Lista com filtros e detalhe com linha do tempo, valores (RN-10), pagamento, estornos, corrida,
 * trocas e avaliação. Dado pessoal do cliente MASCARADO (nome abreviado, e-mail e celular parciais, endereço só bairro e cidade). Cortados (DEC-071):
 * destaque "Atenção" (C3), "Revelar" (C4) e CSV (C5). Cancelar e estornar são as ações que já existiam (`POST /v1/admin/orders/{id}/cancel|refunds`);
 * aqui o detalhe diz quais o perfil pode usar e quanto ainda pode estornar.
 */
/** Janela de dedupe da auditoria de abertura da ficha do pedido (D20 a). */
export const ORDER_VIEW_DEDUPE_MS = 10 * 60_000;

@Injectable()
export class AdminOrdersReadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimitService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(admin: Principal, query: AdminOrderQuery, ctx: RequestContext): Promise<Page<ReturnType<typeof presentRow>>> {
    const limit = parseLimit(query.limit ?? 50); // WB-108 C1: páginas de 50
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const q = query.q?.trim() ?? '';
    // A-07: a busca por e-mail exato (confirma que o e-mail tem pedido), por ID e por trecho do número é limitada por admin e auditada (tipo, HMAC do termo, resultados; nunca o termo).
    if (q !== '') await this.limiter.enforce(`rl:admin-order-search:admin:${admin.userId}`, ORDER_SEARCH_PER_ADMIN_PER_MIN, 60);
    const search: SQL | undefined =
      q === ''
        ? undefined
        : UUID_RE.test(q)
          ? or(eq(orders.id, q.toLowerCase()), eq(orders.userId, q.toLowerCase()))
          : q.includes('@')
            ? eq(users.email, q.toLowerCase())
            : sql`${orders.number} ilike ${`%${escapeLike(q)}%`}`;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const rows = await this.db
      .select({ order: orders, storeName: stores.name, storeCity: stores.addressCityName, customerName: users.name })
      .from(orders)
      .innerJoin(stores, eq(stores.id, orders.storeId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(
        and(
          search,
          query.status && query.status.length > 0 ? inArray(orders.status, query.status) : undefined,
          query.mode ? eq(orders.mode, query.mode) : undefined,
          query.paymentMethod ? eq(orders.paymentMethod, query.paymentMethod) : undefined,
          query.storeId ? eq(orders.storeId, query.storeId) : undefined,
          query.userId ? eq(orders.userId, query.userId) : undefined,
          query.city ? sql`lower(${stores.addressCityName}) = ${query.city.trim().toLowerCase()}` : undefined,
          from ? sql`${orders.createdAt} >= ${from.toISOString()}::timestamptz` : undefined,
          to ? sql`${orders.createdAt} <= ${to.toISOString()}::timestamptz` : undefined,
          timestampCursorBefore(orders.createdAt, orders.id, cursor),
        ),
      )
      .orderBy(...timestampOrderDesc(orders.createdAt, orders.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    if (q !== '') {
      // Falha fechada: sem auditoria, sem resposta. O termo vai só como HMAC (o e-mail e o celular se reverteriam por força bruta num sha256 puro).
      const kind = UUID_RE.test(q) ? 'id' : q.includes('@') ? 'email' : 'number';
      await this.audit.recordStandalone(ctx, {
        action: 'order.search',
        targetType: 'order_search',
        after: { termType: kind, termDigest: hmacHex(this.config.get('AUTH_HMAC_KEY', { infer: true }), `order-search:${kind}:${q.toLowerCase()}`), results: page.length },
      });
    }
    const last = rows.length > limit ? page.at(-1)?.order : undefined;
    return { data: page.map(presentRow), nextCursor: last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  /**
   * WB-352 C14 / ADR-018 D20(a): a ficha do pedido é o ÚNICO caminho de dado de cliente para o suporte, então cada abertura grava `admin.order.view` (admin,
   * sessão, pedido, loja, hora; NUNCA o conteúdo) ANTES de devolver o dado. Falha na consulta de dedupe ou na gravação = erro 500 sem corpo (falha
   * fechada). Dedupe `[HIPÓTESE]`: no máximo 1 linha por (admin, pedido) a cada 10 min, contada da ÚLTIMA linha gravada (a recarga da tela não incha a trilha;
   * a coleta de muitos pedidos distintos continua com uma linha por pedido). Sem estado em memória; a corrida entre duas aberturas pode gravar 2 linhas (aceito).
   */
  private async auditOpen(admin: Principal, ctx: RequestContext, orderId: string, storeId: string, now = new Date()): Promise<void> {
    const last = (await this.audit.lastByActor(this.db, { action: 'admin.order.view', targetType: 'order', actorId: admin.userId, targetIds: [orderId] })).get(orderId);
    if (last && now.getTime() - last.getTime() < ORDER_VIEW_DEDUPE_MS) return;
    await this.audit.record(this.db, ctx, { action: 'admin.order.view', targetType: 'order', targetId: orderId, storeId, after: { adminSessionId: admin.sessionId } });
  }

  async detail(admin: Principal, ctx: RequestContext, orderId: string) {
    const profile = admin.adminProfile as AdminProfile;
    const [row] = await this.db
      .select({ order: orders, storeName: stores.name, storeCity: stores.addressCityName, customerName: users.name, customerEmail: users.email, customerPhone: users.phone })
      .from(orders)
      .innerJoin(stores, eq(stores.id, orders.storeId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.id, orderId));
    if (!row) throw errors.notFound('Pedido não encontrado.');
    const { order } = row;
    await this.auditOpen(admin, ctx, order.id, order.storeId);
    const [items, events, attempts, exchanges, [delivery], [review]] = await Promise.all([
      this.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
      this.db.select({ e: orderEvents, actorName: users.name }).from(orderEvents).leftJoin(users, eq(users.id, orderEvents.actorUserId)).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.id)),
      this.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, order.id)).orderBy(asc(paymentAttempts.createdAt)),
      this.db.select({ id: exchangeRequests.id, number: exchangeRequests.number, type: exchangeRequests.type, status: exchangeRequests.status }).from(exchangeRequests).where(eq(exchangeRequests.orderId, order.id)).orderBy(asc(exchangeRequests.createdAt)),
      this.db.select({ id: deliveries.id, status: deliveries.status }).from(deliveries).where(and(eq(deliveries.orderId, order.id), eq(deliveries.kind, 'delivery'))),
      this.db.select({ rating: reviews.rating, createdAt: reviews.createdAt }).from(reviews).where(and(eq(reviews.orderId, order.id), sql`${reviews.productId} is null`)),
    ]);
    const attemptIds = attempts.map((a) => a.id);
    const intents = attemptIds.length === 0 ? [] : await this.db.select().from(paymentRefundIntents).where(inArray(paymentRefundIntents.attemptId, attemptIds)).orderBy(asc(paymentRefundIntents.createdAt));
    const counted = intents.filter((i) => i.status !== 'failed');
    const refundedCents = counted.reduce((n, i) => n + i.amountCents, 0);
    const paidCents = order.paymentAttemptId && order.paidAt ? order.totalCents : 0;
    const remainingCents = Math.max(0, paidCents - refundedCents);

    // O que ESTE perfil pode fazer (a rota confere de novo no servidor): cancelar = estado não terminal; estornar = pago, sem contestação e com saldo.
    const mayAct = adminHasPermission(profile, 'orders:refund');
    const cancellable = canTransition(order.status, 'cancelled', 'admin', order.mode);
    const allowedActions: ('cancel' | 'refund')[] = [];
    if (mayAct && cancellable) allowedActions.push('cancel');
    if (mayAct && order.paidAt !== null && order.paymentAttemptId !== null && order.disputedAt === null && remainingCents > 0) allowedActions.push('refund');
    // WB-109 C3 / HIP-039: acima deste valor só o super admin estorna (o financeiro vê o teto e a mensagem "Peça aprovação a um super admin").
    const superLimit = await this.params.getNumber('estorno_super_admin_cents');
    const address = (order.address ?? null) as { neighborhood?: string; city?: string; state?: string } | null;
    const finance = order.finance as { merchantNetBeforeProviderFeeCents?: number };
    const latest = attempts.at(-1) ?? null;
    const seesCommission = adminHasPermission(profile, 'commissions:read');

    return {
      ...presentRow({ order, storeName: row.storeName, storeCity: row.storeCity, customerName: row.customerName }),
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelledBy: order.cancelledBy,
      cancelReason: order.cancelReason,
      disputedAt: order.disputedAt?.toISOString() ?? null,
      notReceivedAt: order.notReceivedAt?.toISOString() ?? null,
      couponCode: order.couponCode,
      customer: { id: order.userId, name: maskName(row.customerName), emailMasked: maskEmail(row.customerEmail), phoneMasked: maskPhone(row.customerPhone) },
      // Só bairro, cidade e UF: rua, número, CEP e complemento ficam fora do admin (o "Revelar" é fase 2).
      delivery: order.mode === 'delivery' ? { neighborhood: address?.neighborhood ?? null, city: address?.city ?? null, state: address?.state ?? null, logistics: delivery ? { deliveryId: delivery.id, status: delivery.status } : null } : null,
      items: items.map((i) => ({ name: i.name, attributes: i.attributes, quantity: i.quantity, unitPrice: money(i.unitPriceCents), lineTotal: money(i.lineTotalCents) })),
      values: {
        subtotal: money(order.subtotalCents),
        delivery: money(order.deliveryFeeCents),
        serviceFee: money(order.serviceFeeCents),
        storeDiscount: money(order.storeCouponCents),
        platformDiscount: money(order.platformDiscountCents),
        total: money(order.totalCents),
        // SEC-184 / RN-13: comissão, tarifa da plataforma e líquido da loja são dado comercial; só quem tem `commissions:read` (financeiro e super admin).
        commission: seesCommission ? money(order.commissionCents) : null,
        applicationFee: seesCommission ? money(order.applicationFeeCents) : null,
        merchantNetBeforeProviderFee: seesCommission ? money(finance.merchantNetBeforeProviderFeeCents ?? 0) : null,
      },
      payment: latest
        ? { method: order.paymentMethod, status: latest.status, installments: latest.installments, declineReason: latest.declineReason, attempts: attempts.map((a) => ({ id: a.id, status: a.status, method: a.method, amount: money(a.amountCents), createdAt: a.createdAt.toISOString() })) }
        : null,
      refunds: {
        paid: money(paidCents),
        refunded: money(refundedCents),
        remaining: money(remainingCents),
        items: intents.map((i) => ({ id: i.id, amount: money(i.amountCents), status: i.status, reason: i.reason, at: i.createdAt.toISOString() })),
      },
      // O cliente e a equipe da loja saem com o nome abreviado; o admin vai por extenso (quem agiu).
      timeline: events.map(({ e, actorName }) => ({ status: e.toStatus, from: e.fromStatus, at: e.at.toISOString(), actor: e.actor, actorName: e.actor === 'system' ? null : e.actor === 'admin' ? actorName : maskName(actorName), reason: e.reason })),
      exchanges,
      review: review ? { rating: review.rating, createdAt: review.createdAt.toISOString() } : null,
      allowedActions,
      refundLimit: { superAdminOnlyAboveCents: superLimit, profileCapCents: profile === 'super_admin' ? null : superLimit },
    };
  }
}

function presentRow(r: { order: typeof orders.$inferSelect; storeName: string | null; storeCity: string | null; customerName: string }) {
  const o = r.order;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    mode: o.mode,
    paymentMethod: o.paymentMethod,
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
    store: { id: o.storeId, name: r.storeName ?? '', city: r.storeCity },
    customer: { id: o.userId, name: maskName(r.customerName) },
    total: money(o.totalCents),
  };
}
