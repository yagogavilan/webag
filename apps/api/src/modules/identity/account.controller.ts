import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { UsersService } from '../users/index.js';
import { changePasswordSchema, merchantRoleSchema, phoneSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { adminProfiles, sessions, userRoles, users } from './db/schema.js';
import { SessionService } from './session.service.js';

const updateProfileSchema = z.strictObject({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Perfil, senha, papel de lojista e sessões do próprio usuário. */
@Controller('v1/me')
export class AccountController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  private async profile(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw errors.notFound();
    const [roles, [admin]] = await Promise.all([
      this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)),
      this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, userId)),
    ]);
    const roleList = roles.map((r) => r.role);
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      name: user.name,
      phone: user.phone,
      roles: roleList,
      adminProfile: admin?.active ? admin.profile : null,
      pendingTerms: await this.users.pendingTerms(userId, roleList),
    };
  }

  @Get()
  me(@CurrentPrincipal() principal: Principal) {
    return this.profile(principal.userId);
  }

  /** Campos fixos e estritos: `role`, `email`, `status`, `emailVerified` etc. voltam 400 (SEC-022). */
  @Patch()
  async update(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>) {
    if (Object.keys(body).length > 0) {
      await this.db.update(users).set({ ...body, updatedAt: new Date() }).where(eq(users.id, principal.userId));
    }
    return this.profile(principal.userId);
  }

  @Post('password')
  @HttpCode(200)
  async changePassword(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
  ) {
    return { tokens: await this.auth.changePassword(principal, body, ctx) };
  }

  @Post('merchant-role')
  @HttpCode(204)
  async merchantRole(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Body(new ZodPipe(merchantRoleSchema)) body: z.infer<typeof merchantRoleSchema>,
  ): Promise<void> {
    await this.auth.grantMerchantRole(principal, body.acceptedDocuments, ctx);
  }

  @Get('sessions')
  async listSessions(@CurrentPrincipal() principal: Principal) {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, principal.userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastUsedAt))
      .limit(50);
    return {
      data: rows.map((row) => ({
        id: row.id,
        current: row.id === principal.sessionId,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
        userAgent: row.userAgent,
        ip: row.ip,
      })),
      nextCursor: null,
    };
  }

  /** Sessão de outro usuário responde 404 (SEC-020). */
  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(@CurrentPrincipal() principal: Principal, @Param('sessionId') sessionId: string): Promise<void> {
    if (!UUID.test(sessionId)) throw errors.notFound();
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, principal.userId), isNull(sessions.revokedAt)));
    if (!row) throw errors.notFound('Sessão não encontrada.');
    await this.sessions.revokeSessions(this.db, principal.userId, 'user_revoked', { onlySessionId: sessionId });
  }
}
