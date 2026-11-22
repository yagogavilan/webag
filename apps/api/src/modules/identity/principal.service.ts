import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { storeMembers, type StoreRole, type UserRole } from './db/schema.js';

export interface LoadedPrincipal {
  principal: Principal;
  sessionLastUsedAt: Date;
}

/** Carrega papéis e perfil do banco a cada requisição (ADR-003: nada de papel dentro do JWT). */
@Injectable()
export class PrincipalService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Devolve null se a sessão estiver revogada/expirada ou o usuário não estiver ativo (SEC-010, WB-219 C4).
   * UMA consulta (sessão + usuário + perfil de admin + papéis) só com as colunas usadas: antes eram duas, com `select *` de sessão e usuário
   * (hash de senha) e do perfil de admin (segredo TOTP cifrado) em TODA requisição autenticada. Continua indo ao banco a cada requisição: revogar
   * a sessão vale na hora (ADR-003).
   */
  async load(userId: string, sessionId: string): Promise<LoadedPrincipal | null> {
    const result = await this.db.execute<{
      last_used_at: Date | string;
      revoked_at: Date | string | null;
      absolute_expires_at: Date | string;
      mfa_verified_at: Date | string | null;
      mfa_factor: Principal['mfaFactor'];
      reauth_at: Date | string | null;
      email: string;
      email_verified_at: Date | string | null;
      status: string;
      admin_profile: Principal['adminProfile'];
      admin_active: boolean | null;
      totp_confirmed_at: Date | string | null;
      totp_reenroll_required_at: Date | string | null;
      roles: UserRole[] | null;
    }>(sql`
      select s.last_used_at, s.revoked_at, s.absolute_expires_at, s.mfa_verified_at, s.mfa_factor, s.reauth_at,
             u.email, u.email_verified_at, u.status,
             a.profile as admin_profile, a.active as admin_active, a.totp_confirmed_at, a.totp_reenroll_required_at,
             (select array_agg(r.role) from user_roles r where r.user_id = u.id) as roles
        from sessions s
        join users u on u.id = s.user_id
        left join admin_profiles a on a.user_id = u.id
       where s.id = ${sessionId} and s.user_id = ${userId}`);
    const row = result.rows[0];
    if (!row) return null;
    const date = (value: Date | string | null): Date | null => (value === null ? null : new Date(value));
    if (row.revoked_at || new Date(row.absolute_expires_at) <= new Date() || row.status !== 'active') return null;

    const admin = row.admin_active ? row : null;
    return {
      sessionLastUsedAt: new Date(row.last_used_at),
      principal: {
        userId,
        sessionId,
        email: row.email,
        emailVerified: row.email_verified_at !== null,
        roles: row.roles ?? [],
        adminProfile: admin?.admin_profile ?? null,
        totpConfigured: admin?.totp_confirmed_at != null,
        mfaVerified: row.mfa_verified_at !== null,
        mfaFactor: row.mfa_factor,
        totpReenrollRequired: admin?.totp_reenroll_required_at != null,
        reauthAt: date(row.reauth_at),
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
