import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { authTickets, type TicketKind } from './db/schema.js';

export type AuthTicket = typeof authTickets.$inferSelect;

/**
 * Tickets de uso único (SEC-090 `mfa_token`, SEC-095 `reset_ticket`, SEC-096 `delete_ticket`): 256 bits aleatórios,
 * guardados só como hash, TTL curto, amarrados a uma conta e a uma finalidade. O estado de cada passo fica no banco,
 * nunca no cliente: o servidor só age quando os passos exigidos foram validados NESTE ticket.
 */
@Injectable()
export class TicketService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async issue(kind: TicketKind, userId: string, ttlSeconds: number, init: { emailVerified?: boolean } = {}, executor: DbOrTx = this.db): Promise<string> {
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
  async attempt(kind: TicketKind, rawToken: string, maxAttempts: number): Promise<AuthTicket | null> {
    const [row] = await this.db
      .update(authTickets)
      .set({ attempts: sql`${authTickets.attempts} + 1` })
      .where(
        and(
          eq(authTickets.tokenHash, sha256Hex(rawToken)),
          eq(authTickets.kind, kind),
          isNull(authTickets.usedAt),
          gt(authTickets.expiresAt, new Date()),
          lt(authTickets.attempts, maxAttempts),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Marca o ticket como usado. Só UMA chamada concorrente vence (`used_at IS NULL`). */
  async consume(id: string, executor: DbOrTx = this.db): Promise<boolean> {
    const rows = await executor
      .update(authTickets)
      .set({ usedAt: new Date() })
      .where(and(eq(authTickets.id, id), isNull(authTickets.usedAt)))
      .returning({ id: authTickets.id });
    return rows.length === 1;
  }

  async markMfa(id: string, kind: 'totp' | 'recovery'): Promise<void> {
    await this.db.update(authTickets).set({ mfaVerifiedAt: new Date(), mfaKind: kind }).where(eq(authTickets.id, id));
  }
}
