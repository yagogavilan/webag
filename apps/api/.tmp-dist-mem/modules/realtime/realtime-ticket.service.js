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
import { Redis } from 'ioredis';
import { randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { adminHasPermission, memberHasStorePermission } from '../../platform/auth/permissions.js';
import { errors } from '../../platform/http/app-error.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { PrincipalService } from '../identity/index.js';
export const TICKET_TTL_SECONDS = 60;
/**
 * ADR-003/DEC-045: o painel não guarda o JWT no navegador (cookie HttpOnly); o BFF pede um ticket e o navegador abre o Socket.IO
 * `/rt` com ele. 256 bits, 60 s, USO ÚNICO (`GETDEL`), só o hash fica no Redis, atrelado ao usuário, à sessão e ao escopo
 * (a loja ou o admin pedidos). Permissão é conferida na emissão E de novo no handshake.
 */
let RealtimeTicketService = class RealtimeTicketService {
    redis;
    principals;
    constructor(redis, principals) {
        this.redis = redis;
        this.principals = principals;
    }
    key(ticket) {
        return `rt:ticket:${sha256Hex(ticket)}`;
    }
    /** `store`: membro com a permissão de pedidos (senão 404, não revela a loja, SEC-020). `admin`: perfil com `logistics:read` e MFA feito. */
    async issue(principal, input) {
        if (input.scope === 'store') {
            if (!input.storeId)
                throw errors.validation([{ field: 'storeId', message: 'Informe a loja.' }]);
            const member = await this.principals.storeMembership(principal.userId, input.storeId);
            if (!member || !memberHasStorePermission(member, 'orders'))
                throw errors.notFound('Loja não encontrada.');
        }
        else if (input.scope === 'admin') {
            if (!principal.adminProfile || !principal.mfaVerified || !adminHasPermission(principal.adminProfile, 'logistics:read')) {
                throw errors.forbidden('FORBIDDEN', 'Sem permissão para o tempo real da operação.');
            }
        }
        else if (input.storeId) {
            throw errors.validation([{ field: 'storeId', message: 'Escopo user não leva loja.' }]);
        }
        const ticket = randomToken(32);
        const claims = { userId: principal.userId, sessionId: principal.sessionId, scope: input.scope, ...(input.scope === 'store' ? { storeId: input.storeId } : {}) };
        await this.redis.set(this.key(ticket), JSON.stringify(claims), 'EX', TICKET_TTL_SECONDS);
        return { ticket, expiresInSeconds: TICKET_TTL_SECONDS };
    }
    /** Consome o ticket (uma só leitura vence). Qualquer problema: `null`. */
    async redeem(ticket) {
        if (!/^[A-Za-z0-9_-]{20,100}$/.test(ticket))
            return null;
        const raw = await this.redis.getdel(this.key(ticket));
        if (!raw)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
};
RealtimeTicketService = __decorate([
    Injectable(),
    __param(0, Inject(REDIS)),
    __metadata("design:paramtypes", [Redis,
        PrincipalService])
], RealtimeTicketService);
export { RealtimeTicketService };
//# sourceMappingURL=realtime-ticket.service.js.map