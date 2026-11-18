import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { z } from 'zod';
import {
  AllowPendingMfa,
  Ctx,
  CurrentPrincipal,
  Public,
  type Principal,
  type RequestContext,
} from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AdminUsersService } from './admin-users.service.js';
import {
  acceptInvitationSchema,
  correctEmailSchema,
  emailExistsSchema,
  forgotPasswordSchema,
  loginSchema,
  reauthSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';

type In<T extends z.ZodType> = z.infer<T>;

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly adminUsers: AdminUsersService,
  ) {}

  @Public()
  @RateLimit({ name: 'register', limit: 20, windowSeconds: 3600 })
  @Post('register')
  register(@Body(new ZodPipe(registerSchema)) body: In<typeof registerSchema>, @Ctx() ctx: RequestContext) {
    return this.auth.register(body, ctx);
  }

  @Public()
  @HttpCode(200)
  @RateLimit({ name: 'email-exists', limit: 10, windowSeconds: 60 })
  @Post('email-exists')
  async emailExists(@Body(new ZodPipe(emailExistsSchema)) body: In<typeof emailExistsSchema>, @Ctx() ctx: RequestContext) {
    return { exists: await this.auth.emailExists(body.email, ctx) };
  }

  @Public()
  @HttpCode(200)
  @RateLimit({ name: 'login', limit: 60, windowSeconds: 60 })
  @Post('login')
  login(@Body(new ZodPipe(loginSchema)) body: In<typeof loginSchema>, @Ctx() ctx: RequestContext) {
    return this.auth.login(body, ctx);
  }

  @Public()
  @HttpCode(200)
  @RateLimit({ name: 'refresh', limit: 30, windowSeconds: 60 })
  @Post('refresh')
  refresh(@Body(new ZodPipe(refreshSchema)) body: In<typeof refreshSchema>, @Ctx() ctx: RequestContext) {
    return this.auth.refresh(body.refreshToken, ctx);
  }

  @HttpCode(204)
  @AllowPendingMfa()
  @Post('logout')
  async logout(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.auth.logout(principal);
  }

  @HttpCode(204)
  @AllowPendingMfa()
  @Post('logout-all')
  async logoutAll(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.auth.logoutAll(principal);
  }

  @HttpCode(204)
  @Post('email/verify')
  async verifyEmail(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(verifyEmailSchema)) body: In<typeof verifyEmailSchema>) {
    await this.auth.verifyEmail(principal, body.code);
  }

  @HttpCode(204)
  @Post('email/resend')
  async resend(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext): Promise<void> {
    await this.auth.resendVerification(principal, ctx);
  }

  @HttpCode(204)
  @Post('email/correct')
  async correct(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Body(new ZodPipe(correctEmailSchema)) body: In<typeof correctEmailSchema>,
  ): Promise<void> {
    await this.auth.correctEmail(principal, body.newEmail, body.password, ctx);
  }

  @Public()
  @HttpCode(202)
  @RateLimit({ name: 'password-forgot', limit: 20, windowSeconds: 900 })
  @Post('password/forgot')
  async forgot(@Body(new ZodPipe(forgotPasswordSchema)) body: In<typeof forgotPasswordSchema>, @Ctx() ctx: RequestContext) {
    await this.auth.forgotPassword(body.email, ctx);
    return { message: 'Se o e-mail existir, enviamos um código.' };
  }

  @Public()
  @HttpCode(200)
  @RateLimit({ name: 'password-reset', limit: 30, windowSeconds: 900 })
  @Post('password/reset')
  reset(@Body(new ZodPipe(resetPasswordSchema)) body: In<typeof resetPasswordSchema>, @Ctx() ctx: RequestContext) {
    return this.auth.resetPassword(body, ctx);
  }

  @HttpCode(204)
  @AllowPendingMfa()
  @Post('reauth')
  async reauth(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Body(new ZodPipe(reauthSchema)) body: In<typeof reauthSchema>,
  ): Promise<void> {
    await this.auth.reauth(principal, body, ctx);
  }

  @Public()
  @HttpCode(200)
  @RateLimit({ name: 'invitation-accept', limit: 20, windowSeconds: 900 })
  @Post('invitations/accept')
  async acceptInvitation(@Body(new ZodPipe(acceptInvitationSchema)) body: In<typeof acceptInvitationSchema>, @Ctx() ctx: RequestContext) {
    const { tokens } = await this.adminUsers.accept(body.token, body.password, ctx);
    return { tokens, mfaSetupRequired: true };
  }
}
