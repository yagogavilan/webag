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
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { authTickets } from './db/schema.js';
/**
 * Tickets de uso único (SEC-090 `mfa_token`, SEC-095 `reset_ticket`, SEC-096 `delete_ticket`): 256 bits aleatórios,
 * guardados só como hash, TTL curto, amarrados a uma conta e a uma finalidade. O estado de cada passo fica no banco,
 * nunca no cliente: o servidor só age quando os passos exigidos foram validados NESTE ticket.
 */
let TicketService = class TicketService {
    db;
    constructor(db) {
        this.db = db;
    }
    async issue(kind, userId, ttlSeconds, init = {}, executor = this.db) {
        const token = randomToken(32);
        // Um ticket novo da mesma finalidade invalida os anteriores ainda abertos (evita acumular tickets válidos).
        await executor
            .update(authTickets)
            .set({ usedAt: new Date() })
            .where(and(eq(authTickets.userId, userId), eq(authTickets.kind, kind), isNull(authTickets.usedAt)));
        await executor.insert(authTickets).values({
            kind,
            userId,
            tokenHash: sha256Hex(token),
            expiresAt: new Date(Date.now() + ttlSeconds * 1000),
            emailVerifiedAt: init.emailVerified ? new Date() : null,
        });
        return token;
    }
    /**
     * Conta uma tentativa de forma atômica e devolve o ticket se ainda estiver utilizável (não usado, não vencido,
     * dentro do limite de tentativas). Fora disso, `null`: o chamador responde sempre com o mesmo erro.
     */
    async attempt(kind, rawToken, maxAttempts) {
        const [row] = await this.db
            .update(authTickets)
            .set({ attempts: sql `${authTickets.attempts} + 1` })
            .where(and(eq(authTickets.tokenHash, sha256Hex(rawToken)), eq(authTickets.kind, kind), isNull(authTickets.usedAt), gt(authTickets.expiresAt, new Date()), lt(authTickets.attempts, maxAttempts)))
            .returning();
        return row ?? null;
    }
    /** Marca o ticket como usado. Só UMA chamada concorrente vence (`used_at IS NULL`). */
    async consume(id, executor = this.db) {
        const rows = await executor
            .update(authTickets)
            .set({ usedAt: new Date() })
            .where(and(eq(authTickets.id, id), isNull(authTickets.usedAt)))
            .returning({ id: authTickets.id });
        return rows.length === 1;
    }
    /** Invalida todos os tickets abertos do usuário (ex.: e-mail corrigido, SEC-124). */
    async invalidateAll(userId) {
        await this.db.update(authTickets).set({ usedAt: new Date() }).where(and(eq(authTickets.userId, userId), isNull(authTickets.usedAt)));
    }
    async markMfa(id, kind) {
        await this.db.update(authTickets).set({ mfaVerifiedAt: new Date(), mfaKind: kind }).where(eq(authTickets.id, id));
    }
};
TicketService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], TicketService);
export { TicketService };
//# sourceMappingURL=ticket.service.js.map