import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { adminProfiles, sessions, storeMembers, userRoles, users, type StoreRole } from './db/schema.js';

export interface LoadedPrincipal {
  principal: Principal;
  sessionLastUsedAt: Date;
}

/** Carrega papéis e perfil do banco a cada requisição (ADR-003: nada de papel dentro do JWT). */
@Injectable()
export class PrincipalService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /** Devolve null se a sessão estiver revogada/expirada ou o usuário não estiver ativo (SEC-010, WB-219 C4). */
  async load(userId: string, sessionId: string): Promise<LoadedPrincipal | null> {
    const [row] = await this.db
      .select({
        session: sessions,
        user: users,
        admin: adminProfiles,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    if (!row) return null;
    const { session, user, admin } = row;
    if (session.revokedAt || session.absoluteExpiresAt <= new Date() || user.status !== 'active') return null;

    const roles = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    const activeAdmin = admin?.active ? admin : null;
    return {
      sessionLastUsedAt: session.lastUsedAt,
      principal: {
        userId,
        sessionId,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
        roles: roles.map((r) => r.role),
        adminProfile: activeAdmin?.profile ?? null,
        totpConfigured: activeAdmin?.totpConfirmedAt != null,
        mfaVerified: session.mfaVerifiedAt !== null,
        mfaFactor: session.mfaFactor,
        totpReenrollRequired: activeAdmin?.totpReenrollRequiredAt != null,
        reauthAt: session.reauthAt,
      },
    };
  }

  /** Vínculo do usuário com a loja (RBAC por loja). Nulo = não é membro. */
  async storeMembership(
    userId: string,
    storeId: string,
  ): Promise<{ role: StoreRole; permissions: string[] } | null> {
    const [row] = await this.db
      .select({ role: storeMembers.role, permissions: storeMembers.permissions })
      .from(storeMembers)
      .where(and(eq(storeMembers.userId, userId), eq(storeMembers.storeId, storeId)));
    return row ?? null;
  }
}
