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
import { Inject } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { and, eq } from 'drizzle-orm';
import { adminHasPermission, memberHasStorePermission } from '../../platform/auth/permissions.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { ConfigService } from '@nestjs/config';
import { PrincipalService, SessionService } from '../identity/index.js';
import { RealtimeTicketService } from './realtime-ticket.service.js';
import { storeMembers } from '../identity/db/schema.js';
import { orders } from '../orders/db/schema.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const userRoom = (userId) => `user:${userId}`;
export const storeRoom = (storeId) => `store:${storeId}`;
export const orderRoom = (orderId) => `order:${orderId}`;
export const ADMIN_OPS_ROOM = 'admin:ops';
/** Teto de pedidos acompanhados por socket (o app acompanha 1 a 3; folga para o painel da loja). */
export const MAX_ORDER_ROOMS = 20;
/**
 * Tempo real (ADR-004): namespace `/rt`, só servidor para cliente (mutações seguem em REST) e o evento é AVISO, nunca a fonte da
 * verdade. Autenticação no handshake (`auth.token`, o mesmo access JWT, sessão ativa no banco). As salas são decididas pelo
 * SERVIDOR a partir do banco: `user:{id}`, `store:{id}` (membro com `orders`) e `admin:ops` (admin com MFA e `logistics:read`).
 * `order:{id}` só por `subscribe`, e só se o pedido for do usuário ou da loja dele.
 */
let RealtimeGateway = class RealtimeGateway {
    sessions;
    principals;
    tickets;
    config;
    db;
    server;
    revocations = null;
    constructor(sessions, principals, tickets, config, db) {
        this.sessions = sessions;
        this.principals = principals;
        this.tickets = tickets;
        this.config = config;
        this.db = db;
    }
    /** I10: logout, remoção de funcionário, rebaixamento de admin e troca de senha derrubam os sockets da sessão revogada. */
    onModuleInit() {
        this.revocations = this.sessions.revoked$.subscribe((event) => {
            for (const sessionId of event.sessionIds) {
                void this.disconnectSession(sessionId).catch(() => undefined);
                // A revogação pode ter sido emitida dentro de uma transação ainda não confirmada: repete depois do commit.
                setTimeout(() => void this.disconnectSession(sessionId).catch(() => undefined), 2_000).unref();
            }
        });
    }
    onModuleDestroy() {
        this.revocations?.unsubscribe();
    }
    afterInit(namespace) {
        namespace.use((socket, next) => {
            this.authenticate(socket).then(() => next(), () => next(new Error('unauthenticated')));
        });
    }
    async authenticate(socket) {
        const auth = socket.handshake.auth ?? {};
        if (typeof auth.ticket === 'string' && auth.ticket.length > 0)
            return this.authenticateByTicket(socket, auth.ticket);
        const token = auth.token;
        if (typeof token !== 'string' || token.length === 0 || token.length > 2_000)
            throw new Error('no token');
        const claims = await this.sessions.verifyAccess(token);
        if (!claims)
            throw new Error('bad token');
        const loaded = await this.principals.load(claims.sub, claims.sid);
        if (!loaded)
            throw new Error('no session');
        const { principal } = loaded;
        const data = socket.data;
        data.userId = principal.userId;
        data.sessionId = principal.sessionId;
        await socket.join(userRoom(principal.userId));
        const members = await this.db.select().from(storeMembers).where(eq(storeMembers.userId, principal.userId));
        for (const member of members)
            if (memberHasStorePermission(member, 'orders'))
                await socket.join(storeRoom(member.storeId));
        if (principal.adminProfile && principal.mfaVerified && adminHasPermission(principal.adminProfile, 'logistics:read'))
            await socket.join(ADMIN_OPS_ROOM);
        // Token vencido: o servidor desconecta com o motivo; o cliente renova o token e reconecta (ADR-004).
        const exp = claims.exp;
        this.scheduleExpiry(socket, exp ? exp * 1000 - Date.now() : null);
    }
    /**
     * Handshake por ticket de uso único (DEC-045): o ticket é atrelado a usuário, sessão e escopo. A sessão precisa continuar ativa;
     * as permissões são conferidas de novo agora; só as salas do escopo pedido são abertas. O socket vive no máximo o TTL do access
     * token e depois pede `auth.expired` (o BFF emite outro ticket).
     */
    async authenticateByTicket(socket, ticket) {
        const claims = await this.tickets.redeem(ticket);
        if (!claims)
            throw new Error('bad ticket');
        const loaded = await this.principals.load(claims.userId, claims.sessionId);
        if (!loaded)
            throw new Error('no session');
        const { principal } = loaded;
        const data = socket.data;
        data.userId = principal.userId;
        data.sessionId = principal.sessionId;
        await socket.join(userRoom(principal.userId));
        if (claims.scope === 'store' && claims.storeId) {
            const [member] = await this.db.select().from(storeMembers).where(and(eq(storeMembers.userId, principal.userId), eq(storeMembers.storeId, claims.storeId)));
            if (!member || !memberHasStorePermission(member, 'orders'))
                throw new Error('no membership');
            await socket.join(storeRoom(claims.storeId));
        }
        else if (claims.scope === 'admin') {
            if (!principal.adminProfile || !principal.mfaVerified || !adminHasPermission(principal.adminProfile, 'logistics:read'))
                throw new Error('not admin');
            await socket.join(ADMIN_OPS_ROOM);
        }
        this.scheduleExpiry(socket, this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }) * 1000);
    }
    scheduleExpiry(socket, ms) {
        if (ms === null)
            return;
        const data = socket.data;
        data.expTimer = setTimeout(() => {
            socket.emit('auth.expired', { reason: 'token_expired' });
            socket.disconnect(true);
        }, Math.max(ms, 0));
        data.expTimer.unref();
        socket.once('disconnect', () => clearTimeout(data.expTimer));
    }
    /**
     * O cliente pede para acompanhar UM pedido (tela de acompanhamento). Recusa em silêncio de pedido alheio: mesma resposta de "não
     * existe". Limites (I10): 30 mensagens por minuto por socket (guard global) e no máximo `MAX_ORDER_ROOMS` pedidos por socket.
     */
    async subscribe(socket, body) {
        const orderId = body?.orderId;
        if (typeof orderId !== 'string' || !UUID.test(orderId))
            return { ok: false };
        const following = [...socket.rooms].filter((room) => room.startsWith('order:')).length;
        if (following >= MAX_ORDER_ROOMS && !socket.rooms.has(orderRoom(orderId)))
            return { ok: false };
        const { userId } = socket.data;
        const [order] = await this.db.select({ userId: orders.userId, storeId: orders.storeId }).from(orders).where(eq(orders.id, orderId));
        let allowed = order?.userId === userId;
        if (order && !allowed) {
            const [mine] = await this.db.select().from(storeMembers).where(and(eq(storeMembers.storeId, order.storeId), eq(storeMembers.userId, userId)));
            allowed = mine !== undefined && memberHasStorePermission(mine, 'orders');
        }
        if (!allowed)
            return { ok: false };
        await socket.join(orderRoom(orderId));
        return { ok: true };
    }
    async unsubscribe(socket, body) {
        const orderId = body?.orderId;
        if (typeof orderId !== 'string' || !UUID.test(orderId))
            return { ok: false };
        await socket.leave(orderRoom(orderId));
        return { ok: true };
    }
    /** Emite para várias salas de uma vez: um socket em duas delas recebe UMA cópia. */
    emit(rooms, event, payload) {
        if (!this.server)
            return;
        this.server.to(rooms).emit(event, payload);
    }
    /** Depois de logout ou revogação, derruba os sockets da sessão (o cliente cai no REST e renova o login). */
    async disconnectSession(sessionId) {
        if (!this.server)
            return;
        for (const socket of await this.server.fetchSockets())
            if (socket.data.sessionId === sessionId)
                socket.disconnect(true);
    }
};
__decorate([
    WebSocketServer(),
    __metadata("design:type", Function)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    SubscribeMessage('subscribe'),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "subscribe", null);
__decorate([
    SubscribeMessage('unsubscribe'),
    __param(0, ConnectedSocket()),
    __param(1, MessageBody()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "unsubscribe", null);
RealtimeGateway = __decorate([
    WebSocketGateway({ namespace: '/rt', transports: ['websocket', 'polling'] }),
    __param(4, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [SessionService,
        PrincipalService,
        RealtimeTicketService,
        ConfigService, Object])
], RealtimeGateway);
export { RealtimeGateway };
//# sourceMappingURL=realtime.gateway.js.map