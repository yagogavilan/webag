import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { z } from 'zod';
import {
  AdminOnly,
  AllowPendingMfa,
  Ctx,
  CurrentPrincipal,
  RequireReauth,
  type Principal,
  type RequestContext,
} from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { AdminUsersService } from './admin-users.service.js';
import { inviteAdminSchema, resetAdminAccessSchema, totpConfirmSchema, updateAdminSchema } from './auth.schemas.js';
import { TotpService } from './totp.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};

/** Gestão de admins (WB-101): só super admin, com reautenticação por TOTP recente nas ações que mudam acesso (SEC-016). */
@Controller('v1/admin/admins')
export class AdminUsersController {
  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly totp: TotpService,
  ) {}

  @AdminOnly('admins:manage')
  @Get()
  async list() {
    return { data: await this.adminUsers.list(), pendingInvitations: await this.adminUsers.pendingInvitations(), nextCursor: null };
  }

  @AdminOnly('admins:manage')
  @RequireReauth()
  @Post()
  async invite(@Body(new ZodPipe(inviteAdminSchema)) body: z.infer<typeof inviteAdminSchema>, @Ctx() ctx: RequestContext) {
    const { invitationId, expiresAt } = await this.adminUsers.invite(body, ctx);
    return { invitationId, expiresAt: expiresAt.toISOString() };
  }

  @AdminOnly('admins:manage')
  @RequireReauth()
  @HttpCode(204)
  @Delete('invitations/:invitationId')
  async revokeInvitation(@Param('invitationId') id: string, @Ctx() ctx: RequestContext): Promise<void> {
    await this.adminUsers.revokeInvitation(uuid(id), ctx);
  }

  @AdminOnly('admins:manage')
  @RequireReauth()
  @HttpCode(204)
  @Patch(':userId')
  async update(
    @Param('userId') userId: string,
    @Body(new ZodPipe(updateAdminSchema)) body: z.infer<typeof updateAdminSchema>,
    @Ctx() ctx: RequestContext,
  ): Promise<void> {
    await this.adminUsers.update(uuid(userId), body, ctx);
  }

  @AdminOnly('admins:manage')
  @RequireReauth()
  @HttpCode(204)
  @Post(':userId/totp/reset')
  async resetTotp(
    @CurrentPrincipal() principal: Principal,
    @Param('userId') userId: string,
    @Body(new ZodPipe(resetAdminAccessSchema)) body: z.infer<typeof resetAdminAccessSchema>,
    @Ctx() ctx: RequestContext,
  ): Promise<void> {
    await this.totp.resetFor(principal, uuid(userId), body, ctx);
  }
}

/** Configuração do próprio TOTP: única área que um admin sem segundo fator concluído alcança (WB-222 C3). */
@Controller('v1/admin/totp')
export class AdminTotpController {
  constructor(private readonly totp: TotpService) {}

  @AllowPendingMfa()
  @Post('setup')
  setup(@CurrentPrincipal() principal: Principal) {
    return this.totp.setup(principal);
  }

  /** SEC-092: 10 códigos novos, os antigos morrem. Reautenticação por TOTP recente; avisa o titular por e-mail. */
  @RequireReauth()
  @HttpCode(200)
  @Post('recovery-codes')
  regenerate(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext) {
    return this.totp.regenerateRecoveryCodes(principal, ctx);
  }

  /** Quantos códigos de recuperação restam (o painel avisa com 3 ou menos). */
  @Get('status')
  status(@CurrentPrincipal() principal: Principal) {
    return this.totp.status(principal);
  }

  @AllowPendingMfa()
  @HttpCode(200)
  @Post('confirm')
  confirm(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(totpConfirmSchema)) body: z.infer<typeof totpConfirmSchema>, @Ctx() ctx: RequestContext) {
    return this.totp.confirm(principal, body.code, ctx);
  }
}
