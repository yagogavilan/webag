import { Inject } from '@nestjs/common';
import { ConnectedSocket, MessageBody, type OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { and, eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { adminHasPermission, memberHasStorePermission } from '../../platform/auth/permissions.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { PrincipalService, SessionService } from '../identity/index.js';
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

/**
 * Tempo real (ADR-004): namespace `/rt`, só servidor para cliente (mutações seguem em REST) e o evento é AVISO, nunca a fonte da
 * verdade. Autenticação no handshake (`auth.token`, o mesmo access JWT, sessão ativa no banco). As salas são decididas pelo
 * SERVIDOR a partir do banco: `user:{id}`, `store:{id}` (membro com `orders`) e `admin:ops` (admin com MFA e `logistics:read`).
 * `order:{id}` só por `subscribe`, e só se o pedido for do usuário ou da loja dele.
 */
@WebSocketGateway({ namespace: '/rt', transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayInit {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly sessions: SessionService,
    private readonly principals: PrincipalService,
    @Inject(DRIZZLE) private readonly db: Db,
  ) {}

  afterInit(namespace: Server): void {
    namespace.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        () => next(new Error('unauthenticated')),
      );
    });
  }

  private async authenticate(socket: Socket): Promise<void> {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
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
    if (exp) {
      const ms = Math.max(exp * 1000 - Date.now(), 0);
      data.expTimer = setTimeout(() => {
        socket.emit('auth.expired', { reason: 'token_expired' });
        socket.disconnect(true);
      }, ms);
      data.expTimer.unref();
      socket.once('disconnect', () => clearTimeout(data.expTimer));
    }
  }

  /** O cliente pede para acompanhar UM pedido (tela de acompanhamento). Recusa em silêncio de pedido alheio: mesma resposta de "não existe". */
  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const orderId = (body as { orderId?: unknown } | null)?.orderId;
    if (typeof orderId !== 'string' || !UUID.test(orderId)) return { ok: false };
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
