import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { decryptSecret, encryptSecret, hmacHex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from '../admin/index.js';
import { adminProfiles, adminRecoveryCodes, users } from './db/schema.js';
import { SessionService } from './session.service.js';
import {
  generateRecoveryCode,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp.js';

const RECOVERY_CODE_COUNT = 10;

/** TOTP obrigatório para todo admin (SEC-015, WB-222). */
@Injectable()
export class TotpService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
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

  /** Super admin redefine o TOTP de OUTRO admin (auditado); as sessões dele caem. */
  async resetFor(actor: Principal, targetUserId: string, ctx: RequestContext): Promise<void> {
    if (actor.userId === targetUserId) throw errors.forbidden('CANNOT_RESET_OWN_TOTP', 'Você não pode redefinir o seu próprio TOTP.');
    await this.db.transaction(async (tx) => {
      const [target] = await tx.select().from(adminProfiles).where(eq(adminProfiles.userId, targetUserId)).for('update');
      if (!target) throw errors.notFound('Admin não encontrado.');
      await tx.update(adminProfiles).set({ totpSecretEnc: null, totpConfirmedAt: null, totpLastStep: null, updatedAt: new Date() }).where(eq(adminProfiles.userId, targetUserId));
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, targetUserId));
      await this.sessions.revokeSessions(tx, targetUserId, 'totp_reset');
      await this.audit.record(tx, ctx, { action: 'admin.totp_reset', targetType: 'user', targetId: targetUserId });
    });
  }

  async emailOf(userId: string): Promise<string> {
    const [row] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    return row?.email ?? '';
  }
}
