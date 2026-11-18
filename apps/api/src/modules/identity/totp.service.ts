import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { decryptSecret, encryptSecret, hmacHex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { accessResetEmail, mfaBruteforceEmail, mfaThreeErrorsEmail } from '../../platform/mail/templates.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { AuditService } from '../admin/index.js';
import { randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { adminProfiles, adminRecoveryCodes, invitations, users } from './db/schema.js';
import { SessionService } from './session.service.js';
import {
  generateRecoveryCode,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp.js';

const RECOVERY_CODE_COUNT = 10;
/** SEC-093 / SEC-017: link de reativação com as regras do convite de admin. */
export const ACCESS_RESET_HOURS = 48;
export const RESET_CHANNELS = ['video_call', 'in_person', 'registered_phone'] as const;

/** TOTP obrigatório para todo admin (SEC-015, WB-222). */
@Injectable()
export class TotpService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimitService,
    private readonly mail: MailService,
  ) {}

  private get key(): string {
    return this.config.get('AUTH_HMAC_KEY', { infer: true });
  }

  /** O segredo fica cifrado (AES-256-GCM), com o ID do usuário como AAD: trocar o texto cifrado entre contas falha. */
  private seal(userId: string, secret: string): string {
    return encryptSecret(secret, this.key, 'totp', `user:${userId}`);
  }

  private open(userId: string, sealed: string): string {
    return decryptSecret(sealed, this.key, 'totp', `user:${userId}`);
  }

  private recoveryHash(userId: string, code: string): string {
    return hmacHex(this.key, `recovery:${userId}:${normalizeRecoveryCode(code)}`);
  }

  /** Inicia a configuração. Enquanto não confirmada, repetir a chamada gera um segredo novo. */
  async setup(principal: Principal): Promise<{ secret: string; otpauthUri: string }> {
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, principal.userId));
    if (!admin?.active) throw errors.forbidden();
    if (admin.totpConfirmedAt) {
      throw errors.conflict('TOTP_ALREADY_CONFIGURED', 'TOTP já configurado', 'Use um código de recuperação ou peça a redefinição a outro super admin.');
    }
    const secret = generateTotpSecret();
    await this.db
      .update(adminProfiles)
      .set({ totpSecretEnc: this.seal(principal.userId, secret), totpLastStep: null, updatedAt: new Date() })
      .where(eq(adminProfiles.userId, principal.userId));
    return { secret, otpauthUri: otpauthUri(principal.email, secret) };
  }

  /** Confirma com um código, libera a sessão e mostra os 10 códigos de recuperação UMA vez (WB-222 C2). */
  async confirm(principal: Principal, code: string, ctx: RequestContext): Promise<{ recoveryCodes: string[] }> {
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, principal.userId));
    if (!admin?.active || !admin.totpSecretEnc) throw errors.conflict('TOTP_NOT_STARTED', 'Inicie a configuração do TOTP');
    if (admin.totpConfirmedAt) throw errors.conflict('TOTP_ALREADY_CONFIGURED', 'TOTP já configurado');
    const check = verifyTotp(this.open(principal.userId, admin.totpSecretEnc), code, Date.now(), null);
    if (!check.ok) throw errors.unauthenticated('Código inválido.');

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.db.transaction(async (tx) => {
      await tx
        .update(adminProfiles)
        .set({ totpConfirmedAt: new Date(), totpLastStep: check.step, updatedAt: new Date() })
        .where(eq(adminProfiles.userId, principal.userId));
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, principal.userId));
      await tx.insert(adminRecoveryCodes).values(
        recoveryCodes.map((recovery) => ({ userId: principal.userId, codeHash: this.recoveryHash(principal.userId, recovery) })),
      );
      await this.audit.record(tx, ctx, { action: 'admin.totp_configured', targetType: 'user', targetId: principal.userId });
    });
    await this.sessions.markMfaVerified(principal.sessionId);
    return { recoveryCodes };
  }

  /**
   * SEC-091: limite do 2º fator POR CONTA, de qualquer IP. 5 erros em 15 min colocam o passo em espera (sem conferir o
   * código); 3 erros avisam o titular; 10 erros em 24 h invalidam a senha, revogam as sessões e alertam os super admins.
   * Só é alcançável por quem já tem a senha: não vira bloqueio da conta por terceiros.
   */
  async verifyWithLimits(userId: string, input: string, ctx: RequestContext, allowRecovery = true): Promise<'totp' | 'recovery' | null> {
    const window = await this.limiter.peek(`mfa:15:${userId}`);
    if (window.count >= 5) {
      throw new AppError(429, 'MFA_RATE_LIMITED', 'Muitas tentativas do código', {
        detail: 'Muitas tentativas do código de verificação. Tente novamente mais tarde.',
        retryAfterSeconds: window.ttlSeconds || 900,
      });
    }
    const kind = await this.verifyLoginCode(userId, input, allowRecovery);
    if (kind) return kind;

    const fifteen = await this.limiter.hit(`mfa:15:${userId}`, 900);
    const day = await this.limiter.hit(`mfa:24:${userId}`, 86_400);
    const email = await this.emailOf(userId);
    if (fifteen.count === 3 && (await this.limiter.hit(`mfa:mail:${userId}`, 3600, false)).count === 1) {
      this.mail.enqueue({ to: email, ...mfaThreeErrorsEmail() });
    }
    if (day.count === 10) await this.suspectBruteforce(userId, email, ctx);
    return null;
  }

  /** SEC-091(c): invalida a senha, derruba sessões, avisa titular e super admins, audita. */
  private async suspectBruteforce(userId: string, email: string, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: null, updatedAt: new Date() }).where(eq(users.id, userId));
      await this.sessions.revokeSessions(tx, userId, 'mfa_bruteforce_suspected');
      await this.audit.record(tx, ctx, { action: 'mfa_bruteforce_suspected', actorId: userId, targetType: 'user', targetId: userId });
    });
    this.mail.enqueue({ to: email, ...mfaBruteforceEmail(email, true) });
    const supers = await this.db
      .select({ email: users.email })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId))
      .where(and(eq(adminProfiles.profile, 'super_admin'), eq(adminProfiles.active, true)));
    for (const superAdmin of supers) this.mail.enqueue({ to: superAdmin.email, ...mfaBruteforceEmail(email, false) });
  }

  /**
   * Aceita TOTP (6 dígitos) ou código de recuperação (uso único). Recuperação força reconfigurar o TOTP (WB-222 C5):
   * o segredo é descartado e a sessão sai sem MFA concluído.
   */
  async verifyLoginCode(userId: string, input: string, allowRecovery = true): Promise<'totp' | 'recovery' | null> {
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, userId));
    if (!admin?.totpSecretEnc || !admin.totpConfirmedAt) return null;

    if (/^\d{6}$/.test(input)) {
      return this.db.transaction(async (tx) => {
        const [locked] = await tx.select().from(adminProfiles).where(eq(adminProfiles.userId, userId)).for('update');
        if (!locked?.totpSecretEnc) return null;
        const check = verifyTotp(this.open(userId, locked.totpSecretEnc), input, Date.now(), locked.totpLastStep);
        if (!check.ok) return null;
        await tx.update(adminProfiles).set({ totpLastStep: check.step }).where(eq(adminProfiles.userId, userId));
        return 'totp' as const;
      });
    }

    if (!allowRecovery || normalizeRecoveryCode(input).length !== 16) return null;
    const used = await this.db
      .update(adminRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(adminRecoveryCodes.userId, userId), eq(adminRecoveryCodes.codeHash, this.recoveryHash(userId, input)), isNull(adminRecoveryCodes.usedAt)))
      .returning({ id: adminRecoveryCodes.id });
    if (used.length === 0) return null;
    await this.clear(userId);
    return 'recovery';
  }

  /** Remove segredo e códigos; o admin precisa configurar de novo no próximo acesso. */
  private async clear(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(adminProfiles).set({ totpSecretEnc: null, totpConfirmedAt: null, totpLastStep: null, updatedAt: new Date() }).where(eq(adminProfiles.userId, userId));
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, userId));
    });
  }

  /**
   * SEC-093: super admin redefine o acesso de OUTRO admin (nunca o próprio). Exige motivo e o canal em que a
   * identidade foi conferida fora do sistema. Apaga TOTP e códigos de recuperação, INVALIDA a senha, revoga as
   * sessões e manda um link de reativação (48 h, uso único) só ao e-mail cadastrado. O super admin nunca vê o link.
   */
  async resetFor(actor: Principal, targetUserId: string, input: { reason: string; verifiedChannel: (typeof RESET_CHANNELS)[number] }, ctx: RequestContext): Promise<void> {
    if (actor.userId === targetUserId) throw errors.forbidden('CANNOT_RESET_OWN_TOTP', 'Você não pode redefinir o seu próprio acesso.');
    const token = randomToken(32);
    const target = await this.db.transaction(async (tx) => {
      const [admin] = await tx.select().from(adminProfiles).where(eq(adminProfiles.userId, targetUserId)).for('update');
      if (!admin) throw errors.notFound('Admin não encontrado.');
      const [user] = await tx.select().from(users).where(eq(users.id, targetUserId));
      if (!user) throw errors.notFound('Admin não encontrado.');
      await tx.update(adminProfiles).set({ totpSecretEnc: null, totpConfirmedAt: null, totpLastStep: null, updatedAt: new Date() }).where(eq(adminProfiles.userId, targetUserId));
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, targetUserId));
      await tx.update(users).set({ passwordHash: null, updatedAt: new Date() }).where(eq(users.id, targetUserId));
      await this.sessions.revokeSessions(tx, targetUserId, 'access_reset');
      await tx.insert(invitations).values({
        kind: 'admin',
        email: user.email,
        name: user.name,
        tokenHash: sha256Hex(token),
        payload: { profile: admin.profile, reactivateUserId: targetUserId },
        invitedBy: actor.userId,
        expiresAt: new Date(Date.now() + ACCESS_RESET_HOURS * 3_600_000),
      });
      await this.audit.record(tx, ctx, {
        action: 'admin.access_reset',
        targetType: 'user',
        targetId: targetUserId,
        reason: input.reason,
        after: { verifiedChannel: input.verifiedChannel },
      });
      return user;
    });
    const link = `${this.config.get('ADMIN_WEB_URL', { infer: true })}/convite?token=${token}`;
    this.mail.enqueue({ to: target.email, ...accessResetEmail(link, ACCESS_RESET_HOURS) });
  }

  async emailOf(userId: string): Promise<string> {
    const [row] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    return row?.email ?? '';
  }
}
