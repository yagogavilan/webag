import { Inject, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { ConnectedSocket, MessageBody, type OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { and, eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { adminHasPermission, memberHasStorePermission } from '../../platform/auth/permissions.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../platform/config/env.js';
import { PrincipalService, SessionService } from '../identity/index.js';
import { RealtimeTicketService } from './realtime-ticket.service.js';
import { storeMembers } from '../identity/db/schema.js';
import { orders } from '../orders/db/schema.js';

/** Dados guardados no socket depois do handshake (nunca vêm do cliente). */
interface SocketData {
  userId: string;
  sessionId: string;
  expTimer?: NodeJS.Timeout;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const userRoom = (userId: string): string => `user:${userId}`;
export const storeRoom = (storeId: string): string => `store:${storeId}`;
export const orderRoom = (orderId: string): string => `order:${orderId}`;
export const ADMIN_OPS_ROOM = 'admin:ops';
/** Teto de pedidos acompanhados por socket (o app acompanha 1 a 3; folga para o painel da loja). */
export const MAX_ORDER_ROOMS = 20;

/**
 * Tempo real (ADR-004): namespace `/rt`, só servidor para cliente (mutações seguem em REST) e o evento é AVISO, nunca a fonte da
 * verdade. Autenticação no handshake (`auth.token`, o mesmo access JWT, sessão ativa no banco). As salas são decididas pelo
 * SERVIDOR a partir do banco: `user:{id}`, `store:{id}` (membro com `orders`) e `admin:ops` (admin com MFA e `logistics:read`).
 * `order:{id}` só por `subscribe`, e só se o pedido for do usuário ou da loja dele.
 */
@WebSocketGateway({ namespace: '/rt', transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayInit, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private revocations: Subscription | null = null;

  constructor(
    private readonly sessions: SessionService,
    private readonly principals: PrincipalService,
    private readonly tickets: RealtimeTicketService,
    private readonly config: ConfigService<Env, true>,
    @Inject(DRIZZLE) private readonly db: Db,
  ) {}

  /** I10: logout, remoção de funcionário, rebaixamento de admin e troca de senha derrubam os sockets da sessão revogada. */
  onModuleInit(): void {
    this.revocations = this.sessions.revoked$.subscribe((event) => {
      for (const sessionId of event.sessionIds) {
        void this.disconnectSession(sessionId).catch(() => undefined);
        // A revogação pode ter sido emitida dentro de uma transação ainda não confirmada: repete depois do commit.
        setTimeout(() => void this.disconnectSession(sessionId).catch(() => undefined), 2_000).unref();
      }
    });
  }

  onModuleDestroy(): void {
    this.revocations?.unsubscribe();
  }

  afterInit(namespace: Server): void {
    namespace.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        () => next(new Error('unauthenticated')),
      );
    });
  }

  private async authenticate(socket: Socket): Promise<void> {
    const auth = (socket.handshake.auth as { token?: unknown; ticket?: unknown } | undefined) ?? {};
    if (typeof auth.ticket === 'string' && auth.ticket.length > 0) return this.authenticateByTicket(socket, auth.ticket);
    const token = auth.token;
    if (typeof token !== 'string' || token.length === 0 || token.length > 2_000) throw new Error('no token');
    const claims = await this.sessions.verifyAccess(token);
    if (!claims) throw new Error('bad token');
    const loaded = await this.principals.load(claims.sub, claims.sid);
    if (!loaded) throw new Error('no session');
    const { principal } = loaded;
    const data = socket.data as SocketData;
    data.userId = principal.userId;
    data.sessionId = principal.sessionId;
    await socket.join(userRoom(principal.userId));
    const members = await this.db.select().from(storeMembers).where(eq(storeMembers.userId, principal.userId));
    for (const member of members) if (memberHasStorePermission(member, 'orders')) await socket.join(storeRoom(member.storeId));
    if (principal.adminProfile && principal.mfaVerified && adminHasPermission(principal.adminProfile, 'logistics:read')) await socket.join(ADMIN_OPS_ROOM);
    // Token vencido: o servidor desconecta com o motivo; o cliente renova o token e reconecta (ADR-004).
    const exp = (claims as { exp?: number }).exp;
    this.scheduleExpiry(socket, exp ? exp * 1000 - Date.now() : null);
  }

  /**
   * Handshake por ticket de uso único (DEC-045): o ticket é atrelado a usuário, sessão e escopo. A sessão precisa continuar ativa;
   * as permissões são conferidas de novo agora; só as salas do escopo pedido são abertas. O socket vive no máximo o TTL do access
   * token e depois pede `auth.expired` (o BFF emite outro ticket).
   */
  private async authenticateByTicket(socket: Socket, ticket: string): Promise<void> {
    const claims = await this.tickets.redeem(ticket);
    if (!claims) throw new Error('bad ticket');
    const loaded = await this.principals.load(claims.userId, claims.sessionId);
    if (!loaded) throw new Error('no session');
    const { principal } = loaded;
    const data = socket.data as SocketData;
    data.userId = principal.userId;
    data.sessionId = principal.sessionId;
    await socket.join(userRoom(principal.userId));
    if (claims.scope === 'store' && claims.storeId) {
      const [member] = await this.db.select().from(storeMembers).where(and(eq(storeMembers.userId, principal.userId), eq(storeMembers.storeId, claims.storeId)));
      if (!member || !memberHasStorePermission(member, 'orders')) throw new Error('no membership');
      await socket.join(storeRoom(claims.storeId));
    } else if (claims.scope === 'admin') {
      if (!principal.adminProfile || !principal.mfaVerified || !adminHasPermission(principal.adminProfile, 'logistics:read')) throw new Error('not admin');
      await socket.join(ADMIN_OPS_ROOM);
    }
    this.scheduleExpiry(socket, this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }) * 1000);
  }

  private scheduleExpiry(socket: Socket, ms: number | null): void {
    if (ms === null) return;
    const data = socket.data as SocketData;
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
  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const orderId = (body as { orderId?: unknown } | null)?.orderId;
    if (typeof orderId !== 'string' || !UUID.test(orderId)) return { ok: false };
    const following = [...socket.rooms].filter((room) => room.startsWith('order:')).length;
    if (following >= MAX_ORDER_ROOMS && !socket.rooms.has(orderRoom(orderId))) return { ok: false };
    const { userId } = socket.data as SocketData;
    const [order] = await this.db.select({ userId: orders.userId, storeId: orders.storeId }).from(orders).where(eq(orders.id, orderId));
    let allowed = order?.userId === userId;
    if (order && !allowed) {
      const [mine] = await this.db.select().from(storeMembers).where(and(eq(storeMembers.storeId, order.storeId), eq(storeMembers.userId, userId)));
      allowed = mine !== undefined && memberHasStorePermission(mine, 'orders');
    }
    if (!allowed) return { ok: false };
    await socket.join(orderRoom(orderId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const orderId = (body as { orderId?: unknown } | null)?.orderId;
    if (typeof orderId !== 'string' || !UUID.test(orderId)) return { ok: false };
    await socket.leave(orderRoom(orderId));
    return { ok: true };
  }

  /** Emite para várias salas de uma vez: um socket em duas delas recebe UMA cópia. */
  emit(rooms: string[], event: string, payload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(rooms).emit(event, payload);
  }

  /** Depois de logout ou revogação, derruba os sockets da sessão (o cliente cai no REST e renova o login). */
  async disconnectSession(sessionId: string): Promise<void> {
    if (!this.server) return;
    for (const socket of await this.server.fetchSockets()) if ((socket.data as SocketData).sessionId === sessionId) socket.disconnect(true);
  }
}
