import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { STAFF_ASSIGNABLE_PERMISSIONS } from '../../platform/auth/permissions.js';
import type { Env } from '../../platform/config/env.js';
import { randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { staffInviteEmail } from '../../platform/mail/templates.js';
import { ParametersService } from '../admin/index.js';
import { invitations, storeMembers, userRoles, users } from '../identity/db/schema.js';
import { PasswordService, SessionService } from '../identity/index.js';
import { storeActivity, type stores } from './db/schema.js';

type Store = typeof stores.$inferSelect;
export const STAFF_INVITE_DAYS = 7;

/** Equipe da loja (WB-075, SEC-014/016/017). Funcionário em duas lojas continua proibido na 1.0 (R-09c). */
@Injectable()
export class TeamService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
    private readonly mail: MailService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly params: ParametersService,
  ) {}

  private validatePermissions(permissions: string[]): string[] {
    const allowed = STAFF_ASSIGNABLE_PERMISSIONS as readonly string[];
    const unique = [...new Set(permissions)];
    const unknown = unique.filter((p) => !allowed.includes(p));
    if (unknown.length > 0) {
      throw errors.unprocessable('INVALID_PERMISSION', 'Permissão inexistente', { errors: [{ field: 'permissions', message: `Permissão inválida: ${unknown.join(', ')}.` }] });
    }
    return unique;
  }

  private async log(storeId: string, actorId: string, action: string, details: Record<string, unknown>): Promise<void> {
    await this.db.insert(storeActivity).values({ storeId, actorId, action, details });
  }

  /** Mensagem única para qualquer e-mail que não possa ser convidado: não revela se tem conta nem se já é de outra loja (SEC-017). */
  private cannotInvite = () => errors.unprocessable('CANNOT_INVITE', 'Não foi possível convidar este e-mail', { detail: 'Não foi possível convidar este e-mail.' });

  async invite(store: Store, principal: Principal, input: { email: string; name: string; permissions: string[] }): Promise<{ invitationId: string; expiresAt: Date }> {
    const permissions = this.validatePermissions(input.permissions);
    const [existingUser] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existingUser) {
      const [member] = await this.db.select({ storeId: storeMembers.storeId }).from(storeMembers).where(eq(storeMembers.userId, existingUser.id));
      if (member) throw this.cannotInvite();
    }
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + STAFF_INVITE_DAYS * 86_400_000);
    const created = await this.db.transaction(async (tx) => {
      // Reenviar invalida o convite anterior para o mesmo e-mail (R-09b).
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.kind, 'store_staff'), eq(invitations.email, input.email), isNull(invitations.usedAt), isNull(invitations.revokedAt)));
      const [row] = await tx
        .insert(invitations)
        .values({ kind: 'store_staff', email: input.email, name: input.name, tokenHash: sha256Hex(token), payload: { storeId: store.id, permissions }, invitedBy: principal.userId, expiresAt })
        .returning();
      if (!row) throw new Error('Falha ao criar convite');
      await tx.insert(storeActivity).values({ storeId: store.id, actorId: principal.userId, action: 'team.invite', details: { permissions } });
      return row;
    });
    const link = `${this.config.get('ADMIN_WEB_URL', { infer: true })}/lojista/convite?token=${token}`;
    this.mail.enqueue({ to: input.email, ...staffInviteEmail(link, store.name ?? 'Webag', STAFF_INVITE_DAYS) });
    return { invitationId: created.id, expiresAt };
  }

  async revokeInvitation(store: Store, principal: Principal, invitationId: string): Promise<void> {
    // I1: a loja entra no WHERE; convite de outra loja nunca é tocado (404 sem efeito).
    const rows = await this.db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.kind, 'store_staff'),
          sql`${invitations.payload}->>'storeId' = ${store.id}`,
          isNull(invitations.usedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });
    if (!rows[0]) throw errors.notFound('Convite não encontrado.');
    await this.log(store.id, principal.userId, 'team.invite_revoke', {});
  }

  /** Convite aceito: conta nova nasce com e-mail confirmado (o clique prova a posse, R-09e); conta existente confirma a senha. */
  async accept(input: { token: string; password: string }, ctx: RequestContext) {
    const gone = () => errors.gone('INVITATION_INVALID', 'Convite inválido', 'Peça um novo convite.');
    return this.db.transaction(async (tx) => {
      const [invite] = await tx.select().from(invitations).where(eq(invitations.tokenHash, sha256Hex(input.token))).for('update');
      if (!invite || invite.kind !== 'store_staff' || invite.usedAt || invite.revokedAt || invite.expiresAt <= new Date()) throw gone();
      const payload = invite.payload as { storeId: string; permissions: string[] };
      const [existing] = await tx.select().from(users).where(eq(users.email, invite.email));
      let userId: string;
      if (existing) {
        if (!(await this.passwords.verify(existing.passwordHash, input.password))) throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', { detail: 'E-mail ou senha incorretos.' });
        const [member] = await tx.select().from(storeMembers).where(eq(storeMembers.userId, existing.id));
        if (member) throw this.cannotInvite();
        userId = existing.id;
        if (!existing.emailVerifiedAt) await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, existing.id));
      } else {
        this.passwords.assertPolicy(input.password, await this.params.getNumber('senha_min'));
        const [created] = await tx
          .insert(users)
          .values({ email: invite.email, name: invite.name, passwordHash: await this.passwords.hash(input.password), emailVerifiedAt: new Date(), passwordChangedAt: new Date() })
          .returning({ id: users.id });
        if (!created) throw new Error('Falha ao criar a conta');
        await tx.insert(userRoles).values({ userId: created.id, role: 'customer' });
        userId = created.id;
      }
      await tx.insert(storeMembers).values({ storeId: payload.storeId, userId, role: 'staff', permissions: payload.permissions });
      await tx.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, invite.id));
      await tx.insert(storeActivity).values({ storeId: payload.storeId, actorId: userId, action: 'team.invite_accept', details: {} });
      const session = await this.sessions.createSession(tx, userId, ctx, { mfaVerified: false, reauth: true });
      return { tokens: session.tokens, storeId: payload.storeId };
    });
  }

  async list(storeId: string) {
    const members = await this.db
      .select({ userId: users.id, name: users.name, email: users.email, role: storeMembers.role, permissions: storeMembers.permissions, since: storeMembers.createdAt })
      .from(storeMembers)
      .innerJoin(users, eq(users.id, storeMembers.userId))
      .where(eq(storeMembers.storeId, storeId));
    const pending = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.kind, 'store_staff'),
          sql`${invitations.payload}->>'storeId' = ${storeId}`,
          isNull(invitations.usedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    return {
      members: members.map((m) => ({ ...m, since: m.since.toISOString() })),
      invitations: pending.map((i) => ({ id: i.id, email: i.email, name: i.name, permissions: (i.payload as { permissions: string[] }).permissions, expiresAt: i.expiresAt.toISOString() })),
    };
  }

  /** O dono não se remove nem some como último dono (R-09d). Remover derruba as sessões do funcionário (SEC-014). */
  async remove(store: Store, principal: Principal, userId: string): Promise<void> {
    const [member] = await this.db.select().from(storeMembers).where(and(eq(storeMembers.storeId, store.id), eq(storeMembers.userId, userId)));
    if (!member) throw errors.notFound('Pessoa não encontrada na equipe.');
    if (member.role === 'owner') throw errors.conflict('CANNOT_REMOVE_OWNER', 'O dono não pode ser removido', 'A transferência de propriedade fica fora da 1.0.');
    await this.db.transaction(async (tx) => {
      await tx.delete(storeMembers).where(and(eq(storeMembers.storeId, store.id), eq(storeMembers.userId, userId), ne(storeMembers.role, 'owner')));
      await this.sessions.revokeSessions(tx, userId, 'staff_removed');
      await tx.insert(storeActivity).values({ storeId: store.id, actorId: principal.userId, action: 'team.remove', details: { userId } });
    });
  }

  async setPermissions(store: Store, principal: Principal, userId: string, permissionsInput: string[]): Promise<void> {
    const permissions = this.validatePermissions(permissionsInput);
    const [member] = await this.db.select().from(storeMembers).where(and(eq(storeMembers.storeId, store.id), eq(storeMembers.userId, userId)));
    if (!member) throw errors.notFound('Pessoa não encontrada na equipe.');
    if (member.role === 'owner') throw errors.conflict('CANNOT_EDIT_OWNER', 'O dono sempre tem todas as permissões');
    await this.db.transaction(async (tx) => {
      await tx.update(storeMembers).set({ permissions }).where(and(eq(storeMembers.storeId, store.id), eq(storeMembers.userId, userId)));
      await tx.insert(storeActivity).values({ storeId: store.id, actorId: principal.userId, action: 'team.permissions', details: { userId, before: member.permissions, after: permissions } });
    });
  }

  /** WB-075 C8: "quem fez o quê", sem dado do cliente. */
  async activity(storeId: string, limit = 50) {
    const rows = await this.db
      .select({ action: storeActivity.action, createdAt: storeActivity.createdAt, actorName: users.name, details: storeActivity.details })
      .from(storeActivity)
      .leftJoin(users, eq(users.id, storeActivity.actorId))
      .where(eq(storeActivity.storeId, storeId))
      .orderBy(desc(storeActivity.createdAt), desc(storeActivity.id))
      .limit(limit);
    return rows.map((r) => ({ action: r.action, at: r.createdAt.toISOString(), actor: r.actorName }));
  }
}
