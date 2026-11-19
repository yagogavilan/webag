import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, notExists, sql, type SQL } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { hmacHex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { AuditService } from '../admin/index.js';
import { adminProfiles, storeMembers, userRoles, users, userStatusHistory, type AdminProfile } from '../identity/db/schema.js';
import { SessionService } from '../identity/index.js';
import { orders } from '../orders/db/schema.js';
import { stores } from '../stores/db/schema.js';
import { AdminStoresService } from '../stores/index.js';
import { escapeLike, maskEmail, maskName, maskPhone } from '../../platform/http/pii-mask.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { emailSchema, phoneSchema } from '../identity/auth.schemas.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Só caracteres de um celular digitado (dígitos, espaço, parênteses, +, hífen): vira busca por celular COMPLETO, nunca por trecho. */
const PHONE_LIKE = /^[\d\s().+-]+$/;
/** SEC-181: buscas por minuto de cada admin (além do limite por IP do controller). */
export const USER_SEARCH_PER_ADMIN_PER_MIN = 60;
/** SEC-183: o motivo do bloqueio é nota INTERNA (user_status_history e auditoria); o lojista e a equipe dele recebem só este texto. */
export const OWNER_BLOCKED_SUSPENSION_REASON = 'A conta do responsável pela loja foi bloqueada. Fale com o suporte.';

type SearchTerm = { kind: 'id' | 'email' | 'phone' | 'name'; match: SQL | null };

export interface AccountQuery {
  q?: string | undefined;
  role?: 'customer' | 'merchant' | undefined;
  status?: 'active' | 'blocked' | 'deleted' | undefined;
  cursor?: string | undefined;
  limit?: unknown;
}

/**
 * B4 / WB-102 (DEC-073): usuários no admin. Buscar (nome, e-mail, celular ou ID), ver (dados MASCARADOS, lojas, pedidos recentes, histórico de bloqueios),
 * bloquear e desbloquear com motivo. Sem redefinir senha (WB-102 C4 cortado: o usuário usa "esqueci a senha") e sem "Revelar" (fase 2). Conta de admin
 * não aparece aqui (a gestão dela é `/v1/admin/admins`, só do super admin).
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly adminStores: AdminStoresService,
    private readonly limiter: RateLimitService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private notAdmin(): SQL {
    return notExists(this.db.select({ one: sql`1` }).from(adminProfiles).where(eq(adminProfiles.userId, users.id)));
  }

  /**
   * SEC-181: a busca NUNCA desfaz o mascaramento. ID e e-mail só pelo valor inteiro (e-mail normalizado), celular só completo (10 ou 11 dígitos, DDD
   * incluído); formato incompleto ou inválido devolve lista vazia, sem dizer o motivo. Só o NOME aceita trecho (3+ caracteres): o suporte precisa
   * dele e a resposta mostra apenas "Nome S.". Não há índice trigram em e-mail ou celular. Cada busca com termo é auditada (tipo, HMAC do termo,
   * número de resultados; nunca o termo) e limitada por admin.
   */
  private classify(q: string): SearchTerm {
    if (UUID_RE.test(q)) return { kind: 'id', match: eq(users.id, q.toLowerCase()) };
    if (q.includes('@')) {
      const email = emailSchema.safeParse(q);
      return { kind: 'email', match: email.success ? eq(users.email, email.data) : null };
    }
    if (PHONE_LIKE.test(q)) {
      const phone = phoneSchema.safeParse(q);
      return { kind: 'phone', match: phone.success ? eq(users.phone, phone.data) : null };
    }
    return q.length >= 3 ? { kind: 'name', match: sql`lower(${users.name}) like ${`%${escapeLike(q.toLowerCase())}%`}` } : { kind: 'name', match: null };
  }

  async search(admin: Principal, query: AccountQuery, ctx: RequestContext): Promise<Page<ReturnType<AccountsService['presentRow']>>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const q = query.q?.trim() ?? '';
    const term = q === '' ? null : this.classify(q);
    if (term) await this.limiter.enforce(`rl:admin-user-search:admin:${admin.userId}`, USER_SEARCH_PER_ADMIN_PER_MIN, 60);
    const rows =
      term && term.match === null
        ? []
        : await this.db
            .select()
            .from(users)
            .where(
              and(
                this.notAdmin(),
                term?.match ?? undefined,
                query.status ? eq(users.status, query.status) : undefined,
                query.role ? inArray(users.id, this.db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.role, query.role))) : undefined,
                timestampCursorBefore(users.createdAt, users.id, cursor),
              ),
            )
            .orderBy(...timestampOrderDesc(users.createdAt, users.id))
            .limit(limit + 1);
    const page = rows.slice(0, limit);
    if (term) {
      // Falha fechada: sem auditoria, sem resposta. O termo vai só como HMAC (celular tem 10^9 combinações: um sha256 puro se reverte por força bruta).
      await this.audit.recordStandalone(ctx, {
        action: 'user.search',
        targetType: 'user_search',
        after: { termType: term.kind, termDigest: hmacHex(this.config.get('AUTH_HMAC_KEY', { infer: true }), `user-search:${term.kind}:${q.toLowerCase()}`), results: page.length },
      });
    }
    const ids = page.map((u) => u.id);
    const [roleRows, memberRows] =
      ids.length === 0 ? [[], []] : await Promise.all([this.db.select().from(userRoles).where(inArray(userRoles.userId, ids)), this.db.select({ userId: storeMembers.userId }).from(storeMembers).where(inArray(storeMembers.userId, ids))]);
    const last = rows.length > limit ? page.at(-1) : undefined;
    return {
      data: page.map((u) => this.presentRow(u, roleRows.filter((r) => r.userId === u.id).map((r) => r.role), memberRows.filter((m) => m.userId === u.id).length)),
      nextCursor: last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  private presentRow(user: typeof users.$inferSelect, roles: string[], storeCount: number) {
    return {
      id: user.id,
      name: maskName(user.name),
      emailMasked: maskEmail(user.email),
      phoneMasked: maskPhone(user.phone),
      roles: roles.sort(),
      status: user.status,
      storeCount,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  /** Conta de cliente ou lojista; conta de admin responde 404 aqui (não é gerida por esta tela). */
  private async loadUser(id: string, exec: Db | Parameters<Parameters<Db['transaction']>[0]>[0] = this.db, lock = false) {
    const query = exec.select().from(users).where(and(eq(users.id, id), this.notAdmin()));
    const [user] = lock ? await query.for('update') : await query;
    if (!user) throw errors.notFound('Usuário não encontrado.');
    return user;
  }

  async detail(profile: AdminProfile, id: string) {
    const user = await this.loadUser(id);
    const [roleRows, memberships, recent, history] = await Promise.all([
      this.db.select().from(userRoles).where(eq(userRoles.userId, id)),
      this.db.select({ id: stores.id, name: stores.name, status: stores.status, role: storeMembers.role }).from(storeMembers).innerJoin(stores, eq(stores.id, storeMembers.storeId)).where(eq(storeMembers.userId, id)),
      this.db
        .select({ id: orders.id, number: orders.number, status: orders.status, mode: orders.mode, createdAt: orders.createdAt, totalCents: orders.totalCents, storeName: stores.name })
        .from(orders)
        .innerJoin(stores, eq(stores.id, orders.storeId))
        .where(eq(orders.userId, id))
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(10),
      this.db
        .select({ h: userStatusHistory, actorName: users.name })
        .from(userStatusHistory)
        .leftJoin(users, eq(users.id, userStatusHistory.actorId))
        .where(eq(userStatusHistory.userId, id))
        .orderBy(desc(userStatusHistory.createdAt)),
    ]);
    const canBlock = profile === 'super_admin' || profile === 'operations';
    return {
      ...this.presentRow(user, roleRows.map((r) => r.role), memberships.length),
      emailVerified: user.emailVerifiedAt !== null,
      stores: memberships.map((m) => ({ id: m.id, name: m.name, status: m.status, role: m.role })),
      recentOrders: recent.map((o) => ({ id: o.id, number: o.number, status: o.status, mode: o.mode, createdAt: o.createdAt.toISOString(), total: { amount: o.totalCents, currency: 'BRL' as const }, storeName: o.storeName })),
      blockHistory: history.map(({ h, actorName }) => ({ action: h.action, reason: h.reason, at: h.createdAt.toISOString(), byName: actorName, suspendedStoreIds: h.suspendedStoreIds })),
      allowedActions: canBlock ? (user.status === 'active' ? (['block'] as const) : user.status === 'blocked' ? (['unblock'] as const) : []) : [],
    };
  }

  /**
   * WB-102 C3 e C5: bloqueia com motivo; o usuário perde as sessões e vê "Conta indisponível"; se for lojista, a loja dele (aprovada) é suspensa e os
   * pedidos em andamento seguem para a decisão do admin (nada é cancelado aqui). Auditado. Conta de admin, já bloqueada ou excluída: 409.
   */
  async block(admin: Principal, id: string, reason: string, ctx: RequestContext) {
    let historyId = '';
    await this.db.transaction(async (tx) => {
      const user = await this.loadUser(id, tx, true);
      if (user.status === 'blocked') throw errors.conflict('USER_ALREADY_BLOCKED', 'Usuário já está bloqueado');
      if (user.status !== 'active') throw errors.conflict('USER_NOT_ACTIVE', 'Esta conta não está ativa', 'Conta excluída não pode ser bloqueada.');
      await tx.update(users).set({ status: 'blocked', updatedAt: new Date() }).where(eq(users.id, id));
      await this.sessions.revokeSessions(tx, id, 'admin_blocked');
      const [entry] = await tx.insert(userStatusHistory).values({ userId: id, action: 'blocked', reason, actorId: admin.userId }).returning({ id: userStatusHistory.id });
      historyId = entry!.id;
      await this.audit.record(tx, ctx, { action: 'user.block', targetType: 'user', targetId: id, before: { status: 'active' }, after: { status: 'blocked' }, reason });
    });
    // WB-102 C5: a loja do lojista bloqueado é suspensa (cada suspensão tem a sua auditoria e o seu e-mail ao dono); uma falha não desfaz o bloqueio.
    const owned = await this.db.select({ id: stores.id }).from(stores).where(and(eq(stores.ownerUserId, id), eq(stores.status, 'approved')));
    const suspendedStoreIds: string[] = [];
    const failedStoreIds: string[] = [];
    for (const store of owned) {
      try {
        await this.adminStores.suspend(store.id, admin, OWNER_BLOCKED_SUSPENSION_REASON, ctx); // SEC-183: texto neutro; o motivo real fica só no histórico e na auditoria do bloqueio
        suspendedStoreIds.push(store.id);
      } catch {
        failedStoreIds.push(store.id);
      }
    }
    if (suspendedStoreIds.length > 0) {
      await this.db.update(userStatusHistory).set({ suspendedStoreIds }).where(eq(userStatusHistory.id, historyId));
    }
    return { ...(await this.detail(ctx.principal?.adminProfile ?? 'super_admin', id)), suspendedStoreIds, failedStoreIds };
  }

  /** Desbloqueia com motivo. A loja suspensa junto NÃO volta sozinha: o admin a reativa pela tela de lojas, de propósito (WB-102 C3 reverte o usuário). */
  async unblock(admin: Principal, id: string, reason: string, ctx: RequestContext) {
    await this.db.transaction(async (tx) => {
      const user = await this.loadUser(id, tx, true);
      if (user.status !== 'blocked') throw errors.conflict('USER_NOT_BLOCKED', 'Este usuário não está bloqueado');
      await tx.update(users).set({ status: 'active', updatedAt: new Date() }).where(eq(users.id, id));
      await tx.insert(userStatusHistory).values({ userId: id, action: 'unblocked', reason, actorId: admin.userId });
      await this.audit.record(tx, ctx, { action: 'user.unblock', targetType: 'user', targetId: id, before: { status: 'blocked' }, after: { status: 'active' }, reason });
    });
    return this.detail(ctx.principal?.adminProfile ?? 'super_admin', id);
  }
}
