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
var DsrService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { privacyRequestAnsweredEmail, privacyRequestReceivedEmail } from '../../platform/mail/templates.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { AuditService } from '../admin/index.js';
import { privacyRequestEvents, privacyRequests } from './db/schema.js';
export const DSR_DEADLINE_DAYS = 15;
export const DSR_ALERT_DAYS = 10;
const DAY = 86_400_000;
const SYSTEM_CTX = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
export const maskEmail = (email) => {
    const [local = '', domain = ''] = email.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
};
/**
 * WB-217: pedidos de titulares (LGPD art. 18). Entrada pública (formulário, com resposta igual exista ou não conta) ou registro
 * manual do super admin (pedido por e-mail). Prazo de 15 dias e alerta aos 10; só o super admin lê; o e-mail do solicitante aparece
 * mascarado e "revelar" exige reautenticação e grava auditoria. O histórico guarda o que foi respondido (C3).
 */
let DsrService = DsrService_1 = class DsrService {
    db;
    audit;
    mail;
    limiter;
    logger = new Logger(DsrService_1.name);
    timers = [];
    constructor(db, audit, mail, limiter) {
        this.db = db;
        this.audit = audit;
        this.mail = mail;
        this.limiter = limiter;
    }
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1')
            return;
        this.timers.push(setInterval(() => void this.alertDue().catch((e) => this.logger.error(e.message)), 60 * 60_000).unref());
    }
    onApplicationShutdown() {
        this.timers.forEach(clearInterval);
    }
    present(row, now = new Date()) {
        const daysLeft = Math.ceil((row.dueAt.getTime() - now.getTime()) / DAY);
        return {
            id: row.id,
            protocol: row.protocol,
            type: row.type,
            channel: row.channel,
            status: row.status,
            requester: maskEmail(row.requesterEmail),
            receivedAt: row.receivedAt.toISOString(),
            dueAt: row.dueAt.toISOString(),
            daysLeft,
            overdue: row.status !== 'answered' && row.dueAt <= now,
            answeredAt: row.answeredAt?.toISOString() ?? null,
        };
    }
    async open(input, ctx) {
        const [account] = await this.db.select({ id: t.users.id }).from(t.users).where(and(eq(t.users.email, input.email), eq(t.users.status, 'active')));
        const receivedAt = input.receivedAt ?? new Date();
        return this.db.transaction(async (tx) => {
            const [seq] = (await tx.execute(sql `select nextval('privacy_protocol_seq')::text as n`)).rows;
            const protocol = `PV-${String(seq?.n ?? '0').padStart(4, '0')}`;
            const [row] = await tx
                .insert(privacyRequests)
                .values({ protocol, type: input.type, channel: input.channel, requesterEmail: input.email, userId: account?.id ?? null, message: input.message, receivedAt, dueAt: new Date(receivedAt.getTime() + DSR_DEADLINE_DAYS * DAY) })
                .returning();
            if (!row)
                throw new Error('Falha ao registrar o pedido');
            await tx.insert(privacyRequestEvents).values({ requestId: row.id, action: 'opened', actorId: input.actorId ?? null, note: `canal ${input.channel}` });
            await this.audit.record(tx, ctx, { action: 'privacy.request_opened', targetType: 'privacy_request', targetId: row.id, after: { protocol, type: input.type, channel: input.channel }, actorId: input.actorId ?? null, actorRole: input.actorId ? 'super_admin' : 'titular' });
            return row;
        });
    }
    /**
     * Formulário público (CC7/WB-217 C5): sempre responde igual, com protocolo, exista ou não conta com o e-mail (anti-enumeração).
     * Limites: 5 por hora por IP (decorator) e 3 por dia por e-mail.
     */
    async submit(input, ctx) {
        await this.limiter.enforce(`dsr:email:${sha256Hex(input.email)}`, 3, 86_400);
        const row = await this.open({ type: input.type, email: input.email, message: input.message ?? null, channel: 'form' }, ctx);
        this.mail.enqueue({ to: input.email, ...privacyRequestReceivedEmail(row.protocol, row.dueAt) });
        return { protocol: row.protocol, dueAt: row.dueAt.toISOString() };
    }
    /** Registro manual (pedido recebido por e-mail do encarregado), só super admin. */
    async register(ctx, input) {
        const receivedAt = input.receivedAt && input.receivedAt <= new Date() ? input.receivedAt : new Date();
        const row = await this.open({ type: input.type, email: input.email, message: input.message ?? null, channel: 'email', receivedAt, actorId: ctx.principal?.userId ?? null }, ctx);
        return this.present(row);
    }
    async list(query) {
        const limit = parseLimit(query.limit);
        const cursor = decodeCursor(query.cursor);
        const conditions = [];
        if (query.status)
            conditions.push(eq(privacyRequests.status, query.status));
        if (query.overdue)
            conditions.push(and(inArray(privacyRequests.status, ['new', 'in_progress']), lte(privacyRequests.dueAt, new Date())));
        if (cursor)
            conditions.push(sql `(${privacyRequests.dueAt}, ${privacyRequests.id}) > (${cursor.d}::timestamptz, ${cursor.id}::uuid)`);
        const rows = await this.db
            .select()
            .from(privacyRequests)
            .where(and(...conditions))
            // Aberto primeiro, o prazo mais curto no topo; respondidos depois.
            .orderBy(sql `(${privacyRequests.status} = 'answered')`, asc(privacyRequests.dueAt), asc(privacyRequests.id))
            .limit(limit + 1);
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return { data: page.map((r) => this.present(r)), nextCursor: rows.length > limit && last ? encodeCursor({ d: last.dueAt.toISOString(), id: last.id }) : null };
    }
    async get(id) {
        const [row] = await this.db.select().from(privacyRequests).where(eq(privacyRequests.id, id));
        if (!row)
            throw errors.notFound('Pedido não encontrado.');
        const events = await this.db.select().from(privacyRequestEvents).where(eq(privacyRequestEvents.requestId, id)).orderBy(asc(privacyRequestEvents.at));
        return { ...this.present(row), hasAccount: row.userId !== null, messagePreview: row.message ? `${row.message.slice(0, 40)}${row.message.length > 40 ? '…' : ''}` : null, answer: row.answer, history: events.map((e) => ({ action: e.action, note: e.note, at: e.at.toISOString(), actorId: e.actorId })) };
    }
    /** "Revelar" (C3 e OP3): e-mail e mensagem completos, com motivo e auditoria. A rota exige reautenticação (TOTP) do super admin. */
    async reveal(ctx, id, reason) {
        const [row] = await this.db.select().from(privacyRequests).where(eq(privacyRequests.id, id));
        if (!row)
            throw errors.notFound('Pedido não encontrado.');
        await this.db.transaction(async (tx) => {
            await tx.insert(privacyRequestEvents).values({ requestId: id, action: 'revealed', actorId: ctx.principal?.userId ?? null, note: reason });
            await this.audit.record(tx, ctx, { action: 'privacy.request_revealed', targetType: 'privacy_request', targetId: id, reason });
        });
        return { email: row.requesterEmail, message: row.message, userId: row.userId };
    }
    async progress(ctx, id) {
        return this.db.transaction(async (tx) => {
            const [row] = await tx.update(privacyRequests).set({ status: 'in_progress' }).where(and(eq(privacyRequests.id, id), eq(privacyRequests.status, 'new'))).returning();
            if (!row) {
                const [existing] = await tx.select().from(privacyRequests).where(eq(privacyRequests.id, id));
                if (!existing)
                    throw errors.notFound('Pedido não encontrado.');
                throw errors.conflict('DSR_INVALID_STATE', 'Pedido já em andamento ou respondido');
            }
            await tx.insert(privacyRequestEvents).values({ requestId: id, action: 'in_progress', actorId: ctx.principal?.userId ?? null });
            await this.audit.record(tx, ctx, { action: 'privacy.request_in_progress', targetType: 'privacy_request', targetId: id });
            return this.present(row);
        });
    }
    /** Registra a resposta, fecha o pedido e avisa o titular por e-mail (C4). Responder duas vezes: 409. */
    async answer(ctx, id, answer) {
        const row = await this.db.transaction(async (tx) => {
            const [done] = await tx
                .update(privacyRequests)
                .set({ status: 'answered', answeredAt: new Date(), answeredBy: ctx.principal?.userId ?? null, answer })
                .where(and(eq(privacyRequests.id, id), inArray(privacyRequests.status, ['new', 'in_progress'])))
                .returning();
            if (!done) {
                const [existing] = await tx.select({ id: privacyRequests.id }).from(privacyRequests).where(eq(privacyRequests.id, id));
                if (!existing)
                    throw errors.notFound('Pedido não encontrado.');
                throw errors.conflict('DSR_ALREADY_ANSWERED', 'Pedido já respondido');
            }
            await tx.insert(privacyRequestEvents).values({ requestId: id, action: 'answered', actorId: ctx.principal?.userId ?? null, note: answer });
            await this.audit.record(tx, ctx, { action: 'privacy.request_answered', targetType: 'privacy_request', targetId: id, after: { protocol: done.protocol } });
            return done;
        });
        this.mail.enqueue({ to: row.requesterEmail, ...privacyRequestAnsweredEmail(row.protocol, answer) });
        return this.present(row);
    }
    /** WB-217 C2: alerta ao admin aos 10 dias, uma vez por pedido aberto. */
    async alertDue(now = new Date()) {
        const cutoff = new Date(now.getTime() - DSR_ALERT_DAYS * DAY);
        const due = await this.db
            .select()
            .from(privacyRequests)
            .where(and(inArray(privacyRequests.status, ['new', 'in_progress']), isNull(privacyRequests.alertedAt), lte(privacyRequests.receivedAt, cutoff)));
        for (const row of due) {
            await this.db.transaction(async (tx) => {
                const [claimed] = await tx.update(privacyRequests).set({ alertedAt: now }).where(and(eq(privacyRequests.id, row.id), isNull(privacyRequests.alertedAt))).returning({ id: privacyRequests.id });
                if (!claimed)
                    return;
                await tx.insert(t.paymentAlerts).values({ kind: 'privacy_request_due', details: { requestId: row.id, protocol: row.protocol, dueAt: row.dueAt.toISOString() } });
                await this.audit.record(tx, SYSTEM_CTX, { action: 'privacy.request_due_alert', targetType: 'privacy_request', targetId: row.id, actorId: null, actorRole: 'system' });
            });
        }
        return due.length;
    }
};
DsrService = DsrService_1 = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, AuditService,
        MailService,
        RateLimitService])
], DsrService);
export { DsrService };
//# sourceMappingURL=dsr.service.js.map