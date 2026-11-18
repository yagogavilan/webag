import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq, sql } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { adminInviteEmail } from '../../platform/mail/templates.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { isUniqueViolation } from '../admin/util.js';
import { adminProfiles, invitations, userRoles, users, type AdminProfile } from './db/schema.js';
import { PasswordService } from './password.service.js';
import { SessionService, type TokenPair } from './session.service.js';

/** SEC-017: 48 h para admin (WB-101 C1). */
export const ADMIN_INVITE_HOURS = 48;

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async list(): Promise<
    {
      userId: string;
      name: string;
      email: string;
      profile: AdminProfile;
      active: boolean;
      totpConfigured: boolean;
    }[]
  > {
    const rows = await this.db
      .select({ admin: adminProfiles, user: users })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId))
      .orderBy(desc(adminProfiles.createdAt));
    return rows.map(({ admin, user }) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      profile: admin.profile,
      active: admin.active,
      totpConfigured: admin.totpConfirmedAt !== null,
    }));
  }

  /** WB-101 C1: convite de uso único, ligado ao e-mail, com hash no banco e validade de 48 h. */
  async invite(input: { name: string; email: string; profile: AdminProfile }, ctx: RequestContext): Promise<{ invitationId: string; expiresAt: Date }> {
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) throw errors.conflict('EMAIL_ALREADY_REGISTERED', 'Esse e-mail já tem conta');
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + ADMIN_INVITE_HOURS * 3_600_000);
    const created = await this.db.transaction(async (tx) => {
      const [invite] = await tx
        .insert(invitations)
        .values({
          kind: 'admin',
          email: input.email,
          name: input.name,
          tokenHash: sha256Hex(token),
          payload: { profile: input.profile },
          invitedBy: ctx.principal?.userId ?? null,
          expiresAt,
        })
        .returning();
      if (!invite) throw new Error('Falha ao criar convite');
      await this.audit.record(tx, ctx, {
        action: 'admin.invite',
        targetType: 'invitation',
        targetId: invite.id,
        after: { email: input.email, profile: input.profile, expiresAt },
      });
      return invite;
    });
    const link = `${this.config.get('ADMIN_WEB_URL', { infer: true })}/convite?token=${token}`;
    this.mail.enqueue({ to: input.email, ...adminInviteEmail(link, ADMIN_INVITE_HOURS) });
    return { invitationId: created.id, expiresAt };
  }

  async revokeInvitation(id: string, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [invite] = await tx.select().from(invitations).where(eq(invitations.id, id)).for('update');
      if (!invite) throw errors.notFound('Convite não encontrado.');
      if (invite.usedAt || invite.revokedAt) return;
      await tx.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id));
      await this.audit.record(tx, ctx, { action: 'admin.invite_revoke', targetType: 'invitation', targetId: id });
    });
  }

  /**
   * Aceita o convite: cria a conta de admin com o e-mail já confirmado (o convite provou o controle do endereço)
   * e abre uma sessão SEM MFA: só a tela de configurar o TOTP fica liberada (WB-222 C1).
   * Inválido, usado, revogado ou vencido: 410 (WB-101 C1).
   */
  async accept(token: string, password: string, ctx: RequestContext): Promise<{ tokens: TokenPair; userId: string }> {
    this.passwords.assertPolicy(password, await this.params.getNumber('senha_min'));
    const passwordHash = await this.passwords.hash(password);
    const gone = () => errors.gone('INVITATION_INVALID', 'Convite inválido', 'Peça um novo convite.');
    try {
      return await this.db.transaction(async (tx) => {
        const [invite] = await tx.select().from(invitations).where(eq(invitations.tokenHash, sha256Hex(token))).for('update');
        if (!invite || invite.kind !== 'admin' || invite.usedAt || invite.revokedAt || invite.expiresAt <= new Date()) throw gone();
        const payload = invite.payload as { profile: AdminProfile; reactivateUserId?: string };
        const profile = payload.profile;
        if (payload.reactivateUserId) {
          // SEC-093: reativação de admin existente (senha nova + TOTP novo), sessão sem MFA concluído.
          await tx.update(users).set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, payload.reactivateUserId));
          // SEC-113 (5): 48 h, a partir de agora, para configurar o TOTP novo; depois, só com novo convite.
          await tx
            .update(adminProfiles)
            .set({ totpReenrollRequiredAt: null, totpSetupDeadlineAt: new Date(Date.now() + ADMIN_INVITE_HOURS * 3_600_000), updatedAt: new Date() })
            .where(eq(adminProfiles.userId, payload.reactivateUserId));
          await tx.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, invite.id));
          await this.audit.record(tx, ctx, { action: 'admin.access_reactivated', actorId: payload.reactivateUserId, actorRole: profile, targetType: 'user', targetId: payload.reactivateUserId });
          const session = await this.sessions.createSession(tx, payload.reactivateUserId, ctx, { mfaVerified: false, reauth: true });
          return { tokens: session.tokens, userId: payload.reactivateUserId };
        }
        const [user] = await tx
          .insert(users)
          .values({ email: invite.email, name: invite.name, passwordHash, emailVerifiedAt: new Date(), passwordChangedAt: new Date() })
          .returning();
        if (!user) throw new Error('Falha ao criar admin');
        await tx.insert(adminProfiles).values({ userId: user.id, profile, totpSetupDeadlineAt: new Date(Date.now() + ADMIN_INVITE_HOURS * 3_600_000) });
        await tx.insert(userRoles).values({ userId: user.id, role: 'customer' }).onConflictDoNothing();
        await tx.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, invite.id));
        await this.audit.record(tx, ctx, {
          action: 'admin.invite_accept',
          actorId: user.id,
          actorRole: profile,
          targetType: 'user',
          targetId: user.id,
          after: { profile },
        });
        const session = await this.sessions.createSession(tx, user.id, ctx, { mfaVerified: false, reauth: true });
        return { tokens: session.tokens, userId: user.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw gone();
      throw error;
    }
  }

  /**
   * WB-101 C2/C3: muda perfil ou ativa/desativa; vale na hora e encerra as sessões; nunca deixa o sistema sem
   * super admin ativo (checado com lock para duas desativações simultâneas não passarem juntas).
   */
  async update(targetId: string, patch: { profile?: AdminProfile; active?: boolean }, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Serializa mudanças de admins: o teste "último super admin" depende de enxergar o estado final.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('admins:update'))`);
      const [target] = await tx.select().from(adminProfiles).where(eq(adminProfiles.userId, targetId)).for('update');
      if (!target) throw errors.notFound('Admin não encontrado.');
      const nextProfile = patch.profile ?? target.profile;
      const nextActive = patch.active ?? target.active;
      const removesSuper = target.profile === 'super_admin' && target.active && (nextProfile !== 'super_admin' || !nextActive);
      if (removesSuper) {
        const all = await tx.select().from(adminProfiles);
        const remaining = all.filter((a) => a.userId !== targetId && a.profile === 'super_admin' && a.active);
        if (remaining.length === 0) {
          throw errors.conflict('LAST_SUPER_ADMIN', 'Precisa existir ao menos 1 super admin');
        }
      }
      await tx.update(adminProfiles).set({ profile: nextProfile, active: nextActive, updatedAt: new Date() }).where(eq(adminProfiles.userId, targetId));
      await this.sessions.revokeSessions(tx, targetId, nextActive ? 'admin_profile_changed' : 'admin_deactivated');
      await this.audit.record(tx, ctx, {
        action: 'admin.update',
        targetType: 'user',
        targetId,
        before: { profile: target.profile, active: target.active },
        after: { profile: nextProfile, active: nextActive },
      });
    });
  }
}
